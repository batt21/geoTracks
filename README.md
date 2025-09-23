Visualizzazione delle tracce di Strava in OpenStreetMap

```mermaid
graph TD
    A[reAuthorize()] --> B[loadAndRenderCache()]
    B --> C[getSavedActivities()]
    C --> D[renderActivityOnMap]
    C --> E[renderActivityOnTable]

    B --> F[fetchNewActivities()]
    F --> G[getActivities()]
    G --> H[addNewActivitiesToStorage()]
    H --> I[renderActivityOnMap]
    H --> J[renderActivityOnTable]
    G --> G[ricorsione per tutte le pagine]

    K[Utente clic su attività] --> L[fetchActivityStreams()]
    L --> M[renderActivityChart()]
    M --> N[highlightMarker su mappa]
    N --> M



