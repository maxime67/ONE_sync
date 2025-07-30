# CVE Importer

Un système d'importation automatisé pour synchroniser les données CVE (Common Vulnerabilities and Exposures) depuis le dépôt GitHub de MITRE vers une base de données MongoDB.

## 📋 Table des Matières

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [Structure du Projet](#structure-du-projet)
- [API et Services](#api-et-services)
- [Base de Données](#base-de-données)
- [Gestion des Erreurs](#gestion-des-erreurs)
- [Monitoring](#monitoring)

## 🔍 Aperçu

Ce projet automatise l'importation et la synchronisation des données de vulnérabilités CVE depuis le dépôt officiel [CVEProject/cvelistV5](https://github.com/CVEProject/cvelistV5) vers une base de données MongoDB structurée.

Le système propose deux modes de fonctionnement :
- **Synchronisation incrémentale** : traite uniquement les fichiers modifiés
- **Synchronisation complète** : traite tous les fichiers CVE disponibles

## ✨ Fonctionnalités

- 🔄 **Synchronisation automatique** avec le dépôt GitHub officiel CVE
- 📊 **Traitement par lots** configurable pour optimiser les performances
- 🏢 **Gestion des vendors et produits** avec relations normalisées
- 🔍 **Support des formats CVE v4 et v5**
- ⏰ **Planification via cron jobs**
- 🛡️ **Mécanisme de retry** pour la gestion d'erreurs
- 📈 **Statistiques et compteurs** automatiques
- 🔧 **Sparse checkout Git** pour optimiser le clonage

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Git Service  │───▶│  File Service   │───▶│   DB Service    │
│                 │    │                 │    │                 │
│ - Clone/Pull    │    │ - JSON parsing  │    │ - CVE upsert    │
│ - Diff tracking │    │ - Batch process │    │ - Vendor/Product│
│ - Sparse checkout│   │ - Error retry   │    │ - Relationships │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │      MongoDB            │
                    │                         │
                    │ Collections:            │
                    │ - cves                  │
                    │ - vendors               │
                    │ - products              │
                    └─────────────────────────┘
```

## 📦 Installation

### Prérequis

- Node.js
- MongoDB
- Git

### Installation des dépendances

```bash
npm install
```

### Dépendances principales

- **mongoose** : ODM pour MongoDB
- **simple-git** : Interface Git pour Node.js
- **fs-extra** : Extensions du système de fichiers
- **node-cron** : Planificateur de tâches
- **dotenv** : Gestion des variables d'environnement

## ⚙️ Configuration

### Variables d'environnement

Créez un fichier `.env` à la racine du projet :

```env
# Base de données MongoDB
MONGODB_URI=mongodb://localhost:27017/ONE-DEV

# Configuration du cron job
CRON_SCHEDULE=0 2 * * *
LOG_LEVEL=info

```

### Configuration avancée

Le fichier `config/config.js` permet de personnaliser :

```javascript
module.exports = {
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ONE-DEV'
    },
    github: {
        repoUrl: 'https://github.com/CVEProject/cvelistV5.git',
        localPath: './tmp/cvelist',
        targetFolder: 'cves',
    },
    batch: {
        size: 200 // Taille des lots de traitement
    },
    cron: {
        schedule: process.env.CRON_SCHEDULE || '* * * * *'
    }
};
```

## 🚀 Utilisation

### Synchronisation manuelle

```bash
# Synchronisation incrémentale (recommandée)
npm start

# Synchronisation complète (première fois ou reconstruction)
node server.js --full-sync
```

### Mode développement

```bash
npm run dev
```

### Planification automatique

```bash
# Démarrer le service cron
npm run cron
```

## 📁 Structure du Projet

```
cve-importer/
├── config/
│   └── config.js              # Configuration centralisée
├── models/
│   ├── cveModel.js            # Modèle CVE avec extraction de données
│   ├── vendorModel.js         # Modèle Vendor
│   └── productModel.js        # Modèle Product avec méthode findOrCreate
├── services/
│   ├── gitService.js          # Gestion Git et synchronisation
│   ├── fileService.js         # Traitement des fichiers JSON
│   ├── dbService.js           # Interface base de données
│   ├── productService.js      # Logique métier vendors/products
│   └── cron.js               # Planificateur de tâches
├── server.js                  # Point d'entrée principal
├── package.json
└── README.md
```

## 🔧 API et Services

### GitService

- **`cloneTargetFolder()`** : Clone uniquement le dossier `cves/` avec sparse checkout
- **`syncRepository()`** : Synchronise et retourne les fichiers modifiés
- **`getChangedFilesBetweenCommits()`** : Détecte les changements entre commits

### FileService

- **`processBatch(files, processFunction)`** : Traitement par lots avec retry automatique
- **`processFileWithRetry()`** : Mécanisme de retry pour fichiers individuels

### DBService

- **`upsertCVE(cveData, sourceFile)`** : Insert/Update intelligent des CVE
- **`getCVEsByVendor(vendorName)`** : Requêtes par vendor
- **`getCVEsByProduct(productName, vendorName)`** : Requêtes par produit

### ProductService

- **`processVendorProducts(cveData)`** : Traite les relations vendor/product
- **`findOrCreateVendor(vendorName)`** : Gestion des vendors
- **`getVendorStats()`** / **`getProductStats()`** : Statistiques agrégées

## 🗄️ Base de Données

### Schéma CVE

```javascript
{
  cveId: "CVE-2024-12345",
  description: "Vulnerability description",
  assigner: "vendor@example.com",
  state: "PUBLIC",
  publishedDate: Date,
  cvssScore: 8.5,
  severity: "HIGH",
  affectedProducts: [
    {
      product: ObjectId,
      vendor: ObjectId,
      productName: "Product Name",
      vendorName: "Vendor Name",
      versions: [...]
    }
  ],
  raw_data: { /* Données JSON originales */ }
}
```

### Schéma Vendor

```javascript
{
  name: "Vendor Name",
  productCount: 42,
  cveCount: 158,
  firstSeen: Date,
  lastSeen: Date
}
```

### Schéma Product

```javascript
{
  name: "Product Name",
  vendor: ObjectId,
  vendorName: "Vendor Name",
  versions: [
    { version: "1.0.0", affected: true }
  ],
  cveCount: 15
}
```

## 🛡️ Gestion des Erreurs

### Mécanismes de Resilience

- **Retry automatique** : 3 tentatives pour les erreurs récupérables
- **Gestion des collisions** : Traitement des conflits de clés dupliquées
- **Validation des données** : Vérification de la cohérence des CVE
- **Logging détaillé** : Traçabilité complète des erreurs

### Types d'erreurs gérées

- Conflits de concurrence MongoDB
- Erreurs de parsing JSON
- Timeouts réseau Git
- Contraintes d'unicité

## 📊 Monitoring

### Métriques de Performance

```bash
# Exemple de sortie lors du traitement
Processing batch 1/50
Batch complete. Success: 195, Failed: 5
Overall progress: 200/10000 (2%)
Processing complete! Total: 10000, Success: 9850, Failed: 150
```

### Logs Structurés

- Progression par lots
- Fichiers en échec avec raisons
- Statistiques de performance
- Détection des changements Git

## 📝 Scripts Disponibles

| Script | Description |
|--------|-------------|
| `npm start` | Synchronisation incrémentale |
| `npm run dev` | Mode développement avec nodemon |
| `npm run cron` | Démarrage du planificateur |
| `node server.js --full-sync` | Synchronisation complète |

## 🔍 Exemples d'Usage

### Recherche de CVE par vendor

```javascript
const dbService = require('./services/dbService');

// CVE affectant un vendor spécifique
const cves = await dbService.getCVEsByVendor('microsoft');

// CVE affectant un produit spécifique
const productCves = await dbService.getCVEsByProduct('windows', 'microsoft');
```

### Statistiques

```javascript
const productService = require('./services/productService');

const vendorStats = await productService.getVendorStats();
console.log(`Total vendors: ${vendorStats.totalVendors}`);
console.log('Top vendors:', vendorStats.topVendors);
```

## 🚨 Notes Importantes

1. **Première synchronisation** : Utilisez `--full-sync` pour la configuration initiale
2. **Ressources** : Le traitement complet peut prendre plusieurs heures selon la taille du dataset
4. **Performances** : Ajustez `batch.size` selon les capacités de votre infrastructure