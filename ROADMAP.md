# 🗺️ RBM - Feuille de Route Détaillée

## 📊 État Actuel du Projet
**Dernière mise à jour** : 2025-08-01  
**Statut global** : Phase 1a - MVP Local en cours

### ✅ Éléments Complétés
- [x] Structure projet Next.js + TypeScript + SQLite
- [x] Schéma base de données complet (users, documents, collections, forks, activity_logs)
- [x] API Authentication (register/login avec approbation admin)
- [x] API Users (gestion et approbation)
- [x] API Collections (création, récupération, filtres)
- [x] API Documents (upload métadonnées, récupération, filtres)
- [x] API Fork (système de fork documenté)
- [x] API Activity Feed (journal des actions)
- [x] Types TypeScript complets
- [x] Documentation API (API_TESTING.md)

---

## 🎯 Phase 1a - MVP Local Fonctionnel
**Objectif** : Application web complète sans blockchain  
**Durée estimée** : 1 semaine  
**Statut** : 🔄 En cours

### 🔐 1. Système d'Authentification Frontend
- [ ] **1.1** Interface de connexion/inscription (`src/app/auth/page.tsx`)
- [ ] **1.2** Gestion d'état utilisateur (Context/Zustand)
- [ ] **1.3** Sessions persistantes (localStorage + vérification token)
- [ ] **1.4** Middleware de protection des routes
- [ ] **1.5** Interface d'approbation admin

### 📁 2. Stockage Physique des Fichiers
- [ ] **2.1** Dossier `uploads/` avec organisation par utilisateur
- [ ] **2.2** Middleware upload avec validation (taille, type MIME)
- [ ] **2.3** API de téléchargement de fichiers
- [ ] **2.4** Gestion des erreurs de stockage

### 🖥️ 3. Interfaces Utilisateur Core
- [ ] **3.1** Dashboard principal (vue d'ensemble)
- [ ] **3.2** Page Collections (création, liste, détails)
- [ ] **3.3** Page Documents (upload, liste, visualisation)
- [ ] **3.4** Composant Fork avec interface modale
- [ ] **3.5** Feed d'activité en temps réel

### 🔧 4. Fonctionnalités Basiques
- [ ] **4.1** Visualiseur PDF/Markdown/Images intégré
- [ ] **4.2** Système de recherche (titre, description, contenu)
- [ ] **4.3** Filtres avancés (type, date, utilisateur)
- [ ] **4.4** Liens de partage pour collections publiques

---

## 🌐 Phase 1b - Intégration OrbitDB/IPFS
**Objectif** : Décentralisation des métadonnées  
**Durée estimée** : 1 semaine  
**Statut** : ⏳ En attente

### 📡 5. Infrastructure Décentralisée
- [ ] **5.1** Installation OrbitDB + IPFS node
- [ ] **5.2** Configuration nœuds par utilisateur
- [ ] **5.3** Migration SQLite → OrbitDB pour métadonnées
- [ ] **5.4** Stockage fichiers sur IPFS

### 🔄 6. Système de Fork Décentralisé
- [ ] **6.1** Fork = nouvelle entrée OrbitDB
- [ ] **6.2** Historique des versions avec hash IPFS
- [ ] **6.3** Synchronisation multi-nœuds
- [ ] **6.4** Résolution de conflits

---

## 🚀 Phase 2 - Fonctionnalités Avancées
**Statut** : 📋 Planifié

### 💬 7. Chat et Collaboration
- [ ] **7.1** Socket.IO pour chat temps réel
- [ ] **7.2** Chat au niveau collection
- [ ] **7.3** Chat au niveau document
- [ ] **7.4** Notifications en temps réel

### 🤖 8. Interface Théodore (IA)
- [ ] **8.1** Interface conversationnelle
- [ ] **8.2** Génération de contenu
- [ ] **8.3** Analyse de documents
- [ ] **8.4** Suggestions de fork

### 🎨 9. Génération d'Images
- [ ] **9.1** Intégration Stable Diffusion
- [ ] **9.2** Interface de génération
- [ ] **9.3** Stockage images générées
- [ ] **9.4** Métadonnées de génération

---

## 📋 Phase 3 - Fonctionnalités Communautaires
**Statut** : 📋 Planifié

### 👥 10. Profils et Social
- [ ] **10.1** Profils publics utilisateurs
- [ ] **10.2** Système de follow
- [ ] **10.3** Recommandations de contenu
- [ ] **10.4** Statistiques utilisateur

### 💬 11. Commentaires et Réactions
- [ ] **11.1** Commentaires sur documents
- [ ] **11.2** Commentaires sur forks
- [ ] **11.3** Système de vote/réaction
- [ ] **11.4** Modération contenu

### 📊 12. Mode Présentation
- [ ] **12.1** Vue "live" pour projection
- [ ] **12.2** Mode plein écran
- [ ] **12.3** Navigation tactile
- [ ] **12.4** Synchronisation multi-écrans

---

## 🛠️ Phase 4 - Administration et Export
**Statut** : 📋 Planifié

### 👑 13. Interface Admin
- [ ] **13.1** Dashboard administrateur
- [ ] **13.2** Gestion utilisateurs en masse
- [ ] **13.3** Modération contenu
- [ ] **13.4** Statistiques globales

### 📦 14. Export et Sauvegarde
- [ ] **14.1** Export collections en ZIP
- [ ] **14.2** Export avec hash IPFS complet
- [ ] **14.3** Import/Export de bases OrbitDB
- [ ] **14.4** Sauvegarde automatique

### 📊 15. Journaux DAO
- [ ] **15.1** Journal transparent des actions
- [ ] **15.2** Historique de gouvernance
- [ ] **15.3** Rapports d'activité automatiques
- [ ] **15.4** API de transparence

---

## 🔍 Checkpoints de Continuité

### 📝 À chaque session de travail :
1. **Mettre à jour ce roadmap** avec les tâches complétées
2. **Noter les problèmes rencontrés** et solutions
3. **Identifier la prochaine tâche prioritaire**
4. **Documenter les décisions techniques**

### 📁 Fichiers clés à consulter :
- `ROADMAP.md` (ce fichier) - État global du projet
- `API_TESTING.md` - Tests et validation API
- `src/types/index.ts` - Interfaces TypeScript
- `src/lib/database.ts` - Schéma base de données
- `package.json` - Dependencies et scripts

### 🧪 Tests de santé du projet :
```bash
# Vérifier que l'API fonctionne
npm run dev
curl http://localhost:3000/api/users

# Vérifier la base de données
sqlite3 rbm.db ".tables"

# Vérifier les types
npm run build
```

---

## 🎯 Tâche Immédiate Suivante
**Priorité** : Implémentation de l'authentification frontend (1.1-1.5)

### Actions concrètes :
1. Créer l'interface de login/register dans `src/app/auth/page.tsx`
2. Configurer le système de state management pour l'utilisateur connecté
3. Implémenter les sessions persistantes
4. Tester le flow complet inscription → approbation → connexion

---

*Ce roadmap est un document vivant qui doit être mis à jour à chaque avancement significatif du projet.*