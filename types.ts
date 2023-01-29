type ServerFile = {
	path: string;
	content: string;
	sha: string;
}

type ClientFile = {
	path: string;
	content: ArrayBuffer;
}

type SavedServerFile = {
	path: string;
	sha: string;
	content: string;
}

type GithubFile = {
	path: string;
	sha: string;
	type: string;
	url: string;
}

export type {ClientFile, ServerFile, SavedServerFile, GithubFile}