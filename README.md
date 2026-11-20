# Mes Courses

Générateur de menus et de listes de courses pour le foyer, façon Jow.

- **Menu** : tire au sort N recettes, ajuste le nombre de personnes, change ou retire une recette.
- **Liste** : ingrédients additionnés, adaptés aux portions, triés par rayon ; « J'ai » pour ce qui est déjà au placard ; lien de recherche Leclerc Drive par article ; ajout d'articles libres.
- **Partage** : menu, liste et réglages synchronisés en direct via Firebase entre les adresses autorisées.

En ligne : https://lemoa869121.github.io/courses/

## Fichiers

| Fichier | Rôle |
|---|---|
| `recipes.json` | Le carnet de recettes (mis à jour par Claude) |
| `firebase-config.js` | Configuration Firebase + adresses autorisées |
| `firestore.rules` | Règles de sécurité à coller dans la console Firebase |
| `index.html`, `app.js`, `style.css` | L'appli |

## Format d'une recette

```json
{
  "id": "identifiant-unique",
  "name": "Nom",
  "servings": 4,
  "category": "Viande | Poisson | Végé | Pâtes & riz | Soupe | Salade | Dessert | Autre",
  "prepTime": 30,
  "ingredients": [{ "name": "oignon", "qty": 2, "unit": "", "aisle": "Fruits & légumes" }],
  "steps": ["…"],
  "notes": "facultatif"
}
```

Unités : `g kg ml cl l pièce "c. à s." "c. à c." pincée gousse tranche botte sachet boîte pot paquet` ou `""` pour un nombre.
`qty: null` = « selon besoin ».

## Mise en route Firebase

1. Console Firebase → projet → **Firestore Database** (région europe-west, mode production).
2. **Authentication → Sign-in method** : activer Google. **Settings → Authorized domains** : ajouter `lemoa869121.github.io`.
3. Copier le `firebaseConfig` de l'appli Web dans `firebase-config.js`.
4. **Firestore → Règles** : coller le contenu de `firestore.rules`, publier.

Ajouter une personne au foyer : son adresse Gmail dans `firebase-config.js` **et** dans `firestore.rules` (puis republier les règles).
