# Obsidian Git Sync
Push all new files and pull new files with a simple in editor command. Uses the Github Rest API, so you don't even have to install git on your computer.

## Configuration
- Install it as any other obsidian plugin
- If the plugin should commit itself then put it in a folder named `git-sync` or `obsidian-git-sync`, otherwise it will be pushed to the repository as well, which you might not want to happen.
- Create and copy your repository name and username into the settings.
- Get an access token in your Github account with permissions to your note-repository and paste it into the settings

Use either the pull or push command now!

## Todo
- Commands doesn't report status until they are finished.
- Testing performance for large vaults.

## Issues
- A known bug, as this plugin uses the Github API, is that if you have >1000 files, then you will throttle the API. The limit resets pr. hour, but it means that if you have never used `git-sync` before, you will have to wait some time until it is synced.

You are welcome to report issues.