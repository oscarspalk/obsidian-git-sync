import { DataAdapter } from "obsidian";
import * as path from "path";
import { ServerFile } from "types";


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
        if (!folder.contains(".git") && !folder.contains("node_modules") && !folder.contains("git-sync")) {
            const contents = await fetchAllSubFoldersAndContents(folder, adapter)
            thisFolderFiles.push(...contents)
        }
    }
    return thisFolderFiles
}


export { createFileAndFolders, fetchAllSubFoldersAndContents }