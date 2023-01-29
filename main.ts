import { Octokit } from '@octokit/core';
import { DangerModal } from 'modal';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { createFileAndFolders, fetchAllSubFoldersAndContents } from 'services';
import { ClientFile, GithubFile, SavedServerFile, ServerFile } from 'types';


interface GitSyncSettings {
	repo: string;
	access_token: string;
	username: string;
	files: SavedServerFile[];
	lastTime: number;
}

const DEFAULT_SETTINGS: GitSyncSettings = {
	repo: '',
	access_token: '',
	username: '',
	files: [],
	lastTime: Date.now()
}

export default class GitSync extends Plugin {
	settings: GitSyncSettings;

	async clearFiles(){
		this.settings.files = [];
		await this.saveSettings();
	}

	async pull() {
		const settings = this.settings;
		const token = settings.access_token
		const octokit = new Octokit({
			auth: token
		})
		try {
			const commits = await octokit.request('GET /repos/{owner}/{repo}/commits{?sha,path,author,since,until,per_page,page}', {
				owner: settings.username,
				repo: settings.repo
			})

			const tree = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=true', {
				owner: settings.username,
				repo: settings.repo,
				tree_sha: commits.data[0].sha,
			})

			const serverFiles: ServerFile[] = []

			for (let index = 0; index < tree.data.tree.length; index++) {
				const maybeFile = tree.data.tree[index]
				if (maybeFile.type === "blob") {
					const savedTwin = this.settings.files.findIndex((savedFile, index) => savedFile.path === maybeFile.path)
					if (savedTwin != -1 && this.settings.files[savedTwin].sha === maybeFile.sha) {
						serverFiles.push(this.settings.files[savedTwin])
					}
					else {
						const data = (await octokit.request(maybeFile.url)).data;
						const sFile = { path: maybeFile.path, content: Buffer.from(data.content, "base64").toString('utf-8'), sha: data.sha }
						if(savedTwin != -1){
							this.settings.files[savedTwin] = sFile;
						}
						else {
						this.settings.files.push(sFile)
						}
						serverFiles.push(sFile)
					}

				}
				await this.saveSettings();
			}

			for (let index = 0; index < serverFiles.length; index++) {
				const sFile = serverFiles[index]
				await createFileAndFolders(sFile, this.app.vault.adapter);
			}
			new Notice("Pulled files from server.")
		}
		catch (e) {
			new Notice("Error, source repository is probably empty.")
		}
	}

	async synchronize() {
		const obsidianFiles = await fetchAllSubFoldersAndContents(".obsidian", this.app.vault.adapter);
		const files = this.app.vault.getFiles();
		const settings = this.settings;
		const token = settings.access_token
		const octokit = new Octokit({
			auth: token
		})

		const commits = await octokit.request('GET /repos/{owner}/{repo}/commits{?sha,path,author,since,until,per_page,page}', {
			owner: settings.username,
			repo: settings.repo
		})
		
		const serverFiles: ServerFile[] = []

		try {
			const tree = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=true', {
				owner: settings.username,
				repo: settings.repo,
				tree_sha: commits.data[0].sha,
			})
			for (let index = 0; index < tree.data.tree.length; index++) {
				const maybeFile: GithubFile = tree.data.tree[index]
				if (maybeFile.type === "blob") {
					const savedTwin = this.settings.files.findIndex((savedFile, index) => savedFile.path === maybeFile.path)
					if (savedTwin != -1 && this.settings.files[savedTwin].sha === maybeFile.sha) {
						serverFiles.push(this.settings.files[savedTwin])
					}
					else {
						const data = (await octokit.request(maybeFile.url)).data;
						const sFile = { path: maybeFile.path, content: Buffer.from(data.content, "base64").toString('utf-8'), sha: data.sha }
						if(savedTwin != -1){
							this.settings.files[savedTwin] = sFile;
						}
						else {
						this.settings.files.push(sFile)
						}
						serverFiles.push(sFile)
					}

				}
				await this.saveSettings();
			}
		}
		catch (e) {
			// empty repo
			new Notice("Repository was empty, initialized it.")
		}

		const clientFiles: ClientFile[] = []

		// load obsidian files
		for (let index = 0; index < obsidianFiles.length; index++) {
			let thisFile = obsidianFiles[index]
			const fileData = await this.app.vault.adapter.readBinary(thisFile);
			const thisClientFile = {
				path: thisFile,
				content: fileData
			}
			clientFiles.push(thisClientFile)
		}

		for (let index = 0; index < files.length; index++) {
			const file = files[index]
			const fileData = await this.app.vault.adapter.readBinary(file.path);
			const thisFile = {
				...file,
				content: fileData
			}
			clientFiles.push(thisFile)
		}
		let identicals = 0;
		for (let index = 0; index < clientFiles.length; index++) {
			const file = clientFiles[index]
			const serverFile = serverFiles.find(sFile => sFile.path === file.path);
			if (!serverFile) {
				await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
					owner: settings.username,
					repo: settings.repo,
					path: file.path,
					message: `Created file: ${file.path}`,
					content: Buffer.from(file.content).toString('base64'),

				})
			}
			else if (Buffer.from(file.content).toString('utf-8') === serverFile.content) {
				identicals++;
			}
			else {
				await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
					owner: settings.username,
					repo: settings.repo,
					path: file.path,
					message: `Updated file: ${file.path}`,
					content: Buffer.from(file.content).toString('base64'),
					sha: serverFile.sha,
				})
			}

			if (serverFile) {
				serverFiles.splice(serverFiles.findIndex((val, _) => val.path === serverFile.path), 1)
			}
		}

		if (serverFiles.length != 0) {
			for (let index = 0; index < serverFiles.length; index++) {
				const sFile = serverFiles[index]
				await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
					owner: settings.username,
					repo: settings.repo,
					path: sFile.path,
					message: `Deleted file: ${sFile.path}`,
					sha: sFile.sha,
				})
			}
		}

		if (identicals === clientFiles.length && serverFiles.length === 0) {
			new Notice("Succesfully synced 👌")
		}
		else {
			new Notice("Uploading new files to the server 😒")
		}

	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'push-git',
			name: 'Git Push',
			callback: () => {
				new DangerModal(this.app, async () => {
					await this.synchronize();
				}, "Pushing will delete and overwrite existing content on the server.").open()
			}
		});

		this.addCommand({
			id: 'pull-git',
			name: 'Git Pull',

			callback: () => {
				new DangerModal(this.app, async () => {
					await this.pull();
				}, "Pulling will overwrite duplicates locally, are you sure you want to pull?").open()
			}
		});

		this.addCommand({
			id: 'clear-files',
			name: 'Clear Files',
			callback: async () => {
				await this.clearFiles();
			}
		})

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: GitSync;

	constructor(app: App, plugin: GitSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Git Sync' });

		new Setting(containerEl)
			.setName('Github Repository URL')
			.setDesc('Your repository')
			.addText(text => text
				.setPlaceholder('Enter your url')
				.setValue(this.plugin.settings.repo)
				.onChange(async (value) => {
					this.plugin.settings.repo = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Github Username')
			.setDesc('Your username')
			.addText(text => text
				.setPlaceholder('Enter your username')
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Github Access Token')
			.setDesc('Your access token')
			.addText(text => text
				.setPlaceholder('Enter your token')
				.setValue(this.plugin.settings.access_token)
				.onChange(async (value) => {
					this.plugin.settings.access_token = value;
					await this.plugin.saveSettings();
				}));
	}
}
