# Mes Courses

Générateur de menus et de listes de courses pour le foyer, façon Jow.

- **Menu** : tire au sort N recettes, ajuste le nombre de personnes, change ou retire une recette.
- **Liste** : ingrédients additionnés, adaptés aux portions, triés par rayon ; « J'ai » pour ce qui est déjà au placard ; ajout d'articles libres.
- **Recherche par ingrédients** : les recettes qui utilisent le plus ce que tu as remontent en tête.

En ligne : https://lemoa869121.github.io/Courses/

## Fichiers

| Fichier | Rôle |
|---|---|
| `recipes.json` | Le carnet de recettes (mis à jour par Claude) |
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

## Données

Le menu, la liste et les réglages sont enregistrés dans le navigateur de chaque appareil (pas de compte, pas de serveur). Ils ne sont pas partagés entre téléphones.
