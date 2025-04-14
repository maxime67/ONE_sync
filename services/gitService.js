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
                await git.raw(['fetch', '--depth=1', 'origin', 'master']);
                await git.checkout('master');
            } else {
                // If repo exists, just pull the latest changes
                console.log('Repository already exists, pulling latest changes...');
                await git.pull('origin', 'master');
            }

            console.log('Repository cloned/updated successfully!');
            return this.localPath;
        } catch (error) {
            console.error('Error cloning repository:', error.message);
            throw error;
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