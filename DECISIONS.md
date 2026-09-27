# DECISIONS — Rombas 3D

## Périmètre géographique

J'ai retenu une emprise d'environ 9 × 9 km : latitude 49.210 à 49.290 et longitude 6.035 à 6.155. Elle place Rombas au centre tout en conservant suffisamment de recul pour lire la vallée de l'Orne, les coteaux, le Fond Saint-Martin et la Côte de Drince.

## Sources et cache

Les bâtiments, routes, voies ferrées, cours d'eau, surfaces d'eau, boisements, zones industrielles/commerciales et principaux POI sont demandés à OpenStreetMap via Overpass. Le résultat est enregistré dans `data/rombas-osm.json` et n'est plus téléchargé aux lancements suivants.

Le relief utilise SRTM 30 m via l'API publique OpenTopoData. Une grille 33 × 33 est récupérée puis mise en cache dans `data/rombas-terrain.json`. Le client effectue une interpolation bilinéaire de cette grille. L'exagération verticale est limitée à 1,28× : elle rend la vallée et la Côte de Drince nettement lisibles sans transformer le relief réel.

Three.js 0.180.0 est également téléchargé une seule fois et mis en cache dans `vendor/three.module.js`, afin que les lancements suivants ne dépendent plus d'un CDN.

## Bâtiments

Les empreintes des bâtiments proviennent des ways OSM `building=*`. La hauteur utilise d'abord `height`, puis `building:levels × 3,1 m`. En l'absence de ces champs, une hauteur cohérente est estimée par type de bâtiment : garage/remise, maison standard, résidentiel collectif, industriel/entrepôt, église. Les valeurs extrêmes sont bornées pour éviter les anomalies de saisie OSM.

Les bâtiments anonymes sont fusionnés par lots de 450 géométries afin de réduire fortement le nombre de draw calls. Les bâtiments nommés restent des meshes séparés pour permettre la sélection au clic.

## Relief et espaces naturels

Le terrain est une surface triangulée colorée selon l'altitude. Les boisements OSM sont superposés légèrement au-dessus du terrain, sans modifier leur emprise. Les zones industrielles et commerciales utilisent le même principe avec une matière plus minérale.

## Eau

Les surfaces `natural=water` sont dessinées depuis leurs géométries OSM. Les cours d'eau linéaires sont transformés en rubans 3D suivant exactement leur tracé OSM ; les rubans de rivière sont plus larges que les ruisseaux. L'eau emploie un matériau physique semi-transparent avec clearcoat et une très légère modulation d'opacité pour donner une impression de mouvement sans effet de jeu vidéo.

## Routes, ponts et rail

Toutes les voies `highway=*` demandées dans l'emprise sont plaquées sur le relief. Leur largeur visuelle dépend de leur catégorie. Les segments portant `bridge=*` sont rehaussés et utilisent un matériau spécifique.

Les voies `railway=rail|light_rail` sont également plaquées sur le terrain et servent de trajectoire au train animé. La gare de Rombas-Clouange est repérée par les objets OSM `railway=station`, `public_transport=station` ou par son nom lorsqu'il est présent.

## Lieux remarquables

L'église Saint-Rémi est issue de son emprise OSM si elle est disponible. La Tour de Drince est recherchée dans OSM par son nom et les tags de tour/viewpoint. Pour garantir qu'elle reste visible même si le point n'est pas présent dans une réponse Overpass particulière, une position de secours documentée est utilisée : 49.237354, 6.092295. Le modèle de la tour est une représentation procédurale légère d'une tour métallique de 25 m, et non une reconstruction photogrammétrique.

Le Fond Saint-Martin est recherché dans les noms OSM ; la vue caméra de secours utilise le secteur documenté autour de 49.2404, 6.0783. Le plan d'eau lui-même n'est jamais inventé : son contour n'apparaît que s'il est présent dans les données OSM `natural=water`.

## Style graphique

Le rendu vise une maquette urbaine réaliste : bâtiments minéraux légèrement chauds, infrastructures plus neutres, végétation désaturée et eau bleu-gris. Aucun fond satellite n'est utilisé, afin de garder une lecture claire des volumes et des données réellement extrudées.

Le soleil est directionnel et projette des ombres. Le ciel, le brouillard, l'exposition et les températures de couleur changent avec l'heure. La nuit, des points emissifs simulent l'éclairage public et un échantillon de fenêtres éclairées, ce qui est beaucoup plus performant que des centaines de vraies PointLights.

## Animations

Les voitures choisissent uniquement des trajectoires dérivées des axes OSM principaux/secondaires/tertiaires. Le train suit la plus longue géométrie ferroviaire disponible. Les véhicules industriels utilisent une route réelle choisie près du centroïde d'une zone `landuse=industrial`. Les oiseaux décrivent de petits circuits au-dessus de la Tour de Drince ; leur trajectoire est décorative et n'est pas présentée comme une donnée géographique.

## Caméra

Les contrôles orbitaux ont été écrits spécifiquement pour ce projet afin de ne dépendre que du cœur de Three.js : rotation, zoom, pan, inertie et plancher empêchant la caméra de passer sous le terrain. Les vues prédéfinies utilisent en priorité les positions des objets OSM nommés, avec des positions documentées de secours pour les principaux lieux.

Une animation d'ouverture part d'une vue haute de la vallée et converge vers le centre de Rombas.

## Performances

- pixel ratio plafonné à 1,7 ;
- relief limité à 33 × 33 points source puis interpolé ;
- bâtiments anonymes fusionnés par lots ;
- seulement quelques véhicules, un train et sept oiseaux ;
- éclairage nocturne simulé par `THREE.Points` plutôt que par une multitude de lumières dynamiques ;
- objets interactifs limités principalement aux entités nommées ;
- LOD dynamique : les arbres instanciés, voies secondaires et détails nocturnes sont masqués dans les vues très éloignées ;
- pas de textures lourdes ni de tuiles satellite.

## Simplifications et limites

Overpass peut temporairement refuser une requête ou être lent : trois endpoints sont essayés successivement. OpenTopoData peut aussi limiter le débit ; les requêtes d'altitude sont découpées en paquets avec réessais.

Les multipolygones OSM complexes sont rendus membre par membre lorsqu'ils ne sont pas fournis comme un anneau simple ; cela privilégie la robustesse et la performance plutôt qu'une reconstruction SIG complète des trous et relations imbriquées.

Les traces du passé sidérurgique ne sont pas inventées : le projet met visuellement en évidence les zones `landuse=industrial`, bâtiments industriels et objets historiques présents dans OSM. Il ne crée pas d'ancienne usine ou de haut-fourneau qui ne serait pas géolocalisé dans les données récupérées.

## Variante web hébergée (27/09/2026)
Pour supprimer toute installation locale, la version hébergée est devenue une application statique. Les appels `/api/osm` et `/api/terrain` du serveur Node sont remplacés par des appels directs depuis le navigateur vers Overpass et les services d'altitude. Les réponses sont conservées dans IndexedDB avec un identifiant de version afin d'éviter les téléchargements répétés sur un même appareil. Three.js est chargé depuis jsDelivr. Cette variante conserve le même périmètre et la même logique de rendu, mais le cache n'est plus un dossier `./data` sur le serveur : il est propre à chaque navigateur.