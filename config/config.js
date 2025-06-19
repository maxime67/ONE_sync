require('dotenv').config();

module.exports = {
    // MongoDB configuration
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ONE-DEV'
    },

    // GitHub repository configuration
    github: {
        repoUrl: 'https://github.com/CVEProject/cvelistV5.git',
        localPath: './tmp/cvelist',
        // Specify the target folder to clone (to avoid cloning the entire repo)
        targetFolder: 'cves',
    },

    // Batch processing configuration
    batch: {
        size: 200 // Number of documents to process at once
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    },

    // Cron configuration
    cron: {
        schedule: process.env.CRON_SCHEDULE || '* * * * *',
        watchDirs: process.env.WATCH_DIRS ? process.env.WATCH_DIRS.split(',') : []
    }
};