const simpleGit = require('simple-git');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/config');

class GitService {
    constructor() {
        this.git = simpleGit();
        this.repoUrl = config.github.repoUrl;
        this.localPath = config.github.localPath;
        this.targetFolder = config.github.targetFolder;
    }

    /**
     * Clones only the target folder from the repository
     * Uses a sparse checkout to avoid downloading the entire repo
     */
    async cloneTargetFolder() {
        try {
            console.log(`Cloning target folder: ${this.targetFolder} from ${this.repoUrl}`);

            // Create the directory if it doesn't exist
            await fs.ensureDir(this.localPath);

            // Initialize git repo
            const git = simpleGit(this.localPath);

            // Check if git repo already exists
            const isRepo = await fs.pathExists(path.join(this.localPath, '.git'));

            if (!isRepo) {
                // Initialize the repo
                await git.init();
                await git.addRemote('origin', this.repoUrl);

                // Set up sparse checkout
                await git.raw(['config', 'core.sparseCheckout', 'true']);

                // Specify which folders to check out
                await fs.writeFile(
                    path.join(this.localPath, '.git', 'info', 'sparse-checkout'),
                    this.targetFolder + '/*\n'
                );

                // Perform the fetch
                await git.raw(['fetch', '--depth=1', 'origin', 'main']);
                await git.checkout('main');
            } else {
                // If repo exists, just pull the latest changes
                console.log('Repository already exists, pulling latest changes...');
                await git.pull('origin', 'main');
            }

            console.log('Repository cloned/updated successfully!');
            return this.localPath;
        } catch (error) {
            console.error('Error cloning repository:', error.message);
            throw error;
        }
    }

    /**
     * Sync repository (pull if exists, clone if not)
     * Returns list of changed files since last sync
     */
    async syncRepository() {
        try {
            console.log(`Synchronizing repository at ${this.localPath}`);

            // Create the directory if it doesn't exist
            await fs.ensureDir(this.localPath);

            // Initialize git
            const git = simpleGit(this.localPath);

            // Check if git repo already exists
            const isRepo = await fs.pathExists(path.join(this.localPath, '.git'));

            let changedFiles = [];

            if (isRepo) {
                // If repo exists, get the current commit hash before pulling
                const beforePull = await git.revparse(['HEAD']);

                // Pull the latest changes
                console.log('Repository exists, pulling latest changes...');
                await git.pull('origin', 'master');

                // Get list of changed files between the previous and current commit
                const afterPull = await git.revparse(['HEAD']);

                if (beforePull !== afterPull) {
                    console.log(`Repository updated from ${beforePull.substring(0, 7)} to ${afterPull.substring(0, 7)}`);
                    changedFiles = await this.getChangedFilesBetweenCommits(beforePull, afterPull);
                    console.log(`Found ${changedFiles.length} changed files`);
                } else {
                    console.log('No new changes in repository');
                }
            } else {
                // If repo doesn't exist, perform the clone operation
                console.log(`Repository doesn't exist, cloning target folder: ${this.targetFolder}`);
                await this.cloneTargetFolder();

                // For a fresh clone, we'll process all files
                changedFiles = await this.getJsonFiles();
                console.log(`Fresh clone: found ${changedFiles.length} JSON files to process`);
            }

            return changedFiles;
        } catch (error) {
            console.error('Error syncing repository:', error.message);
            throw error;
        }
    }

    /**
     * Get changed files between two commits, filtered by JSON extension and target folder
     */
    async getChangedFilesBetweenCommits(oldCommit, newCommit) {
        try {
            const git = simpleGit(this.localPath);

            // Get the diff between commits
            const diffSummary = await git.diff([`${oldCommit}..${newCommit}`, '--name-only']);

            // Split the result into lines
            const changedPaths = diffSummary.split('\n').filter(line => line.trim() !== '');

            // Filter by target folder and JSON extension
            const targetPath = this.targetFolder.replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes
            const jsonFiles = changedPaths.filter(filePath => {
                return filePath.startsWith(targetPath) && filePath.endsWith('.json');
            });

            // Convert relative paths to absolute paths
            return jsonFiles.map(filePath => path.join(this.localPath, filePath));
        } catch (error) {
            console.error('Error getting changed files between commits:', error.message);
            return [];
        }
    }

    /**
     * Gets a list of JSON files in the target folder
     */
    async getJsonFiles() {
        try {
            const targetPath = path.join(this.localPath, this.targetFolder);
            const files = await this.getFilesRecursively(targetPath);
            return files.filter(file => file.endsWith('.json'));
        } catch (error) {
            console.error('Error getting JSON files:', error.message);
            throw error;
        }
    }

    /**
     * Recursively gets all files in a directory
     */
    async getFilesRecursively(dir) {
        let results = [];
        const items = await fs.readdir(dir);

        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = await fs.stat(itemPath);

            if (stat.isDirectory()) {
                const subResults = await this.getFilesRecursively(itemPath);
                results = results.concat(subResults);
            } else {
                results.push(itemPath);
            }
        }

        return results;
    }
}

module.exports = new GitService();