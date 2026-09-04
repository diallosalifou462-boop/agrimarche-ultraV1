// Le package `leaflet.markercluster` ne fournit pas ses propres types (au
// contraire de `leaflet`). Import par effet de bord uniquement : il étend
// l'objet `L` global avec `L.markerClusterGroup(...)`, utilisé dans
// FleetMapInner.tsx via `(L as any).markerClusterGroup(...)` — donc pas
// besoin de typer précisément l'API ici, juste de déclarer que le module
// existe pour que TypeScript n'échoue pas sur l'import.
declare module 'leaflet.markercluster';
declare module 'leaflet.markercluster/dist/MarkerCluster.css';
declare module 'leaflet.markercluster/dist/MarkerCluster.Default.css';
