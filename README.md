Visualizzazione delle tracce di Strava in OpenStreetMap

```mermaid
graph TD
    A[reAuthorize()] -->|Token OK| B[loadAndRenderCache()]
    B --> C[getSavedActivities()]
    C --> D[renderActivityOnMap]
    C --> E[renderActivityOnTable]

    B --> F[fetchNewActivities()]
    F --> G[getActivities()]
    G --> H[addNewActivitiesToStorage()]
    H --> I[renderActivityOnMap]
    H --> J[renderActivityOnTable]
    G -->|Ricorsione per tutte le pagine| G

    K[Utente clic su attività] --> L[fetchActivityStreams()]
    L --> M[renderActivityChart()]
    M --> N[highlightMarker su mappa]
    N --> M


