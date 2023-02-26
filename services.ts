import { Octokit } from "@octokit/core";
import { DataAdapter } from "obsidian";
import * as path from "path";
import { ClientFile, ServerFile } from "types";


async function createFileAndFolders(sFile: ServerFile, adapter: DataAdapter) {
    const foldersToBeCreated = sFile.path.split("/");
    foldersToBeCreated.splice(foldersToBeCreated.length - 1, 1);
    await adapter.mkdir(path.join(...foldersToBeCreated))
    await adapter.writeBinary(sFile.path, Buffer.from(sFile.content, 'base64'))
}

async function fetchAllSubFoldersAndContents(startPath: string, adapter: DataAdapter): Promise<string[]> {
    const thisFolderFiles: string[] = []
    const thisFolder = await adapter.list(startPath)
    thisFolderFiles.push(...thisFolder.files)
    for (const folder of thisFolder.folders) {
        if (!folder.contains(".git") && !folder.contains("node_modules") && !folder.contains("git-sync") && !folder.contains('obsidian-git-sync')) {
            const contents = await fetchAllSubFoldersAndContents(folder, adapter)
            thisFolderFiles.push(...contents)
        }
    }
    return thisFolderFiles
}

async function createBlob(octokit : Octokit, settings: { username: any; repo: any; }, file : ClientFile){
    const shaAndUrl = (await octokit.request('POST /repos/{owner}/{repo}/git/blobs', {
        owner: settings.username,
        repo: settings.repo,
        content: Buffer.from(file.content).toString('base64'),
        encoding: 'base64'
    })).data;
    return {
        "sha": shaAndUrl.sha,
        "mode": "100644",
        "path": file.path,
        "type": "blob"
    }
}

export { createFileAndFolders, fetchAllSubFoldersAndContents, createBlob }