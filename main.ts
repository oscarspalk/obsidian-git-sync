import { Octokit } from '@octokit/core';
import { DangerModal } from 'modal';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import * as path from 'path';

// Remember to rename these classes and interfaces!
type ServerFile = {
	path: string;
	content: string;
	sha: string;
}
interface GitSyncSettings {
	repo: string;
	access_token: string;
	username: string;
}

const DEFAULT_SETTINGS: GitSyncSettings = {
	repo: '',
	access_token: '',
	username: ''
}

export default class GitSync extends Plugin {
	settings: GitSyncSettings;

	async getCommits() {
		const settings = this.settings;
		const token = settings.access_token
		const octokit = new Octokit({
			auth: token
		})
		const commits = await octokit.request('GET /repos/{owner}/{repo}/commits{?sha,path,author,since,until,per_page,page}', {
			owner: settings.username,
			repo: settings.repo
		})

		console.log(commits)
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
					const data = (await octokit.request(maybeFile.url)).data;
					const sFile = { path: maybeFile.path, content: data.content, sha: data.sha }
					serverFiles.push(sFile)
				}
			}

			for (let index = 0; index < serverFiles.length; index++) {
				const sFile = serverFiles[index]
				await this.createFileAndFolders(sFile);
			}
			new Notice("Pulled files from server.")
		}



		catch (e) {
			new Notice("Error, source repository is probably empty.")
		}

	}

	async createFileAndFolders(sFile: ServerFile) {
		const foldersToBeCreated = sFile.path.split("/");
		foldersToBeCreated.splice(foldersToBeCreated.length - 1, 1);
		await this.app.vault.adapter.mkdir(path.join(...foldersToBeCreated))
		await this.app.vault.adapter.writeBinary(sFile.path, Buffer.from(sFile.content, 'base64'))
	}

	async synchronize() {
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
				const maybeFile = tree.data.tree[index]
				if (maybeFile.type === "blob") {
					const data = (await octokit.request(maybeFile.url)).data;
					const sFile = { path: maybeFile.path, content: Buffer.from(data.content, "base64").toString('utf-8'), sha: data.sha }
					serverFiles.push(sFile)
				}
			}
		}
		catch (e) {
			// empty repo
			new Notice("Repository was empty, initialized it.")
		}

		const clientFiles: any[] = []

		for (let index = 0; index < files.length; index++) {
			const file = files[index]
			const fileData = await this.app.vault.adapter.readBinary(file.path);
			// @ts-ignore
			file.content = fileData;
			clientFiles.push(file)
		}
		let identicals = 0;
		for (let index = 0; index < clientFiles.length; index++) {
			const file = clientFiles[index]
			// @ts-ignore
			const serverFile = serverFiles.find(sFile => sFile.path === file.path);
			if (!serverFile) {
				await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
					owner: settings.username,
					repo: settings.repo,
					path: file.path,
					message: `Created file: ${file.path}`,
					committer: {
						name: 'Obs Bot',
						email: 'obsbot@oscarspalk.com'
					},
					content: Buffer.from(file.content).toString('base64'),

				})
			}
			// @ts-ignore
			else if (file.content === serverFile.content) {
				identicals++;
			}
			else {
				await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
					owner: settings.username,
					repo: settings.repo,
					path: file.path,
					message: `Updated file: ${file.path}`,
					committer: {
						name: 'Obs Bot',
						email: 'obsbot@oscarspalk.com'
					},
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
					committer: {
						name: 'Obs Bot',
						email: 'obsbot@oscarspalk.com'
					},
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

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a simple command that can be triggered anywhere
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
			id: 'commits-git',
			name: 'Git Commits',

			callback: async () => {
				await this.getCommits();
			}
		});
		// This adds a settings tab so the user can configure various aspects of the plugin
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
