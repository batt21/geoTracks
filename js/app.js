$(document).ready(function () {
  // =========================
  // Config & variabili globali
  // =========================
  const AUTH_LINK = "https://www.strava.com/oauth/token";
  const STORAGE_KEY = "savedActivities";
  let access_token = null;

  // Leaflet / mappa
  var map = L.map('map', {
    fullscreenControl: true  // abilita il pulsante fullscreen
  });
  
    // Layer OSM base
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Layer CyclOSM
  var cyclosm = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | Tiles style © CyclOSM',
    maxZoom: 20,
    subdomains: 'abc'
  });

  // Layer OpenTopoMap
  var topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
    maxZoom: 17
  });

  // Layer Satellite (Esri)
  var esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
  });

  // Controllo layer
  var baseMaps = {
    "OpenStreetMap": osm,
    "CyclOSM": cyclosm,
    "OpenTopoMap": topo,
    "Satellite": esri
  };

  L.control.layers(baseMaps).addTo(map);

  // Eventi del fullscreen (opzionale)
  map.on('enterFullscreen', function(){
    console.log('Mappa a tutto schermo');
  });
  map.on('exitFullscreen', function(){
    console.log('Mappa uscita da tutto schermo');
  });

  // DataTable
  var table = $('#activities-table').DataTable({
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.8/i18n/it-IT.json' },
    pageLength: 10,
    order: [[3, 'desc']] // colonna 3 = "Data", ordinamento decrescente
  });

  // container per polylines e stream
  var polylines = {};             // polyline summary per activity.id
  var activeStreamPolyline = null;// polyline ad alta risoluzione dallo stream
  var highlightMarker = null;     // marker che segue l'hover sul grafico
  var selectedActivityId = null;  // activity id corrente selezionata
  var typeSelect = $("#activityFilter");

  // loader / log
  $(document).ajaxStart(() => $("#loader-overlay").show());
  $(document).ajaxStop(() => $("#loader-overlay").hide());
  

  L.Polyline.fromEncoded = function(encoded, options) {
    const coords = polyline.decode(encoded).map(p => [p[0], p[1]]);
    return L.polyline(coords, options);
  };

  function logMessage(msg) {
    const logBox = document.getElementById("log-box");
    if (!logBox) return; // se l'HTML non contiene #log-box, skip
    const time = new Date().toLocaleTimeString();
    logBox.innerHTML += `[${time}] ${msg}<br>`;
    logBox.scrollTop = logBox.scrollHeight;
  }

  // =========================
  // LocalStorage helpers
  // =========================
  function getSavedActivities() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      console.warn("Errore parsing savedActivities:", e);
      return [];
    }
  }

  function setSavedActivities(arr) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.error("Errore salvataggio savedActivities:", e);
    }
  }

  // Legge la più recente start_date_local salvata e ritorna timestamp unix (s)
  function getLatestSavedTimestamp() {
    const saved = getSavedActivities();
    if (!saved || saved.length === 0) return 0;
    let maxTs = 0;
    for (const a of saved) {
      const t = Date.parse(a.start_date_local);
      if (!isNaN(t) && t > maxTs) maxTs = t;
    }
    return Math.floor(maxTs / 1000); // in secondi
  }

  // Salva solo i campi utili per minimizzare lo spazio
  function pickActivityForStorage(activity) {
    return {
      id: activity.id,
      name: activity.name,
      distance: activity.distance,
      moving_time: activity.moving_time,
      start_date_local: activity.start_date_local,
      type: activity.type,
      average_speed: activity.average_speed || null,
      average_heartrate: activity.average_heartrate || null,
      map: (activity.map && activity.map.summary_polyline) ? { summary_polyline: activity.map.summary_polyline } : null
    };
  }

  // Aggiunge solo nuove attività in localStorage e ritorna l'array delle attività aggiunte
  function addNewActivitiesToStorage(activities) {
    if (!Array.isArray(activities) || activities.length === 0) return [];
    const saved = getSavedActivities();
    const savedIds = new Set(saved.map(a => a.id));
    const toAdd = [];
    for (const a of activities) {
      if (!savedIds.has(a.id)) {
        toAdd.push(pickActivityForStorage(a));
      }
    }
    if (toAdd.length > 0) {
      const updated = saved.concat(toAdd);
      setSavedActivities(updated);
    }
    return toAdd;
  }

  function clearSavedActivities() {
    localStorage.removeItem(STORAGE_KEY);
    logMessage("Cache svuotata");
  }

  // =========================
  // Render su mappa e tabella
  // =========================
  function renderActivityOnMap(activity, fitIfFirst = true) {
    if (!activity.map || !activity.map.summary_polyline) return;
    try {
          
      const coords = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
      const poly = L.polyline(coords, { color: 'blue', weight: 2, opacity: 0.5, lineJoin: 'round' }).addTo(map);
      polylines[activity.id] = poly;
      // se è la prima polyline aggiunta, fitBounds
      if (fitIfFirst && Object.keys(polylines).length === 1) {
        map.fitBounds(poly.getBounds());
      }
    } catch (e) {
      console.warn("Errore decodifica polyline activity", activity.id, e);
    }
  }

  function renderActivityOnTable(activity) {
    const distanceKm = (activity.distance / 1000).toFixed(2);
    const movingTimeMin = Math.round(activity.moving_time / 60);
    // uso start_date_local bruto come data per data-date, ma mostro in formato leggibile
    const rawDate = activity.start_date_local;
    const d = new Date(rawDate);
    const startDateFormatted = isNaN(d.getTime()) ? rawDate : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const nameLink = `<a href="#" class="show-track" data-id="${activity.id}" data-date="${rawDate}">${escapeHtml(activity.name)}</a>`;
    const avgSpeed = activity.average_speed ? (activity.average_speed * 3.6).toFixed(1) : "-";
    const avgHR = activity.average_heartrate ? activity.average_heartrate.toFixed(0) : "-";

    table.row.add([ nameLink, distanceKm, activity.type, startDateFormatted, movingTimeMin, avgSpeed, avgHR ]).draw(false);
  }

  // Utility per evitare XSS nel nome
  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"'`=\/]/g, function(s) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'})[s];
    });
  }
  
  // Converte la prima lettera in maiuscolo e la concatena con il resto della stringa
  function capitalizeFirstLetter(str) {
    if (str.length === 0) {
        return ""; // Gestisce le stringhe vuote
    }    
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  //aggiunge i tipi delle attività nella select di filtro
  function addOptionInFilterSelect(type){
      //aggiunge sempre "tutti" come prima voce 
      if (typeSelect.find("option[value='']").length === 0) {
          typeSelect.append($("<option></option>").val("").text(capitalizeFirstLetter("tutti")));
      }
      //agiunge gli altri tipi se non esistono già
      if (typeSelect.find("option[value='"+type+"']").length === 0) {
        typeSelect.append($("<option></option>").val(type).text(capitalizeFirstLetter(type)));
      }
  }

  // Carica cache e renderizza subito per UX reattiva
    function loadAndRenderCache(t) {
      const saved = getSavedActivities();
      if (saved.length === 0) {
        logMessage("Cache vuota");
        return;
      }
      var type = t;
      logMessage(`Cache trovata: ${saved.length} attività`);

      // Mostra loader
      $("#loader-overlay").show();
      var count = 0;
      // Delay per permettere al DOM di aggiornare il loader
      setTimeout(() => {
        // Rimuove eventuali polylines esistenti
        Object.values(polylines).forEach(p => {
          
          if (p && map.hasLayer(p)) map.removeLayer(p);
          
        });
        polylines = {};

        // Pulisce la tabella
        table.clear().draw();
        

        
        // Ridisegna attività
        saved.forEach((act, idx) => {
          if(type === ''){
            
            renderActivityOnMap(act, idx === 0); // fitBounds solo alla prima
            count = saved.length;
          }else{
              if (act.type === type){
                renderActivityOnMap(act, idx === 0);
                count++;
              }
          }
        
           //aggiunge in select il tipo della attività trovata 
           addOptionInFilterSelect(act.type);

           renderActivityOnTable(act);
        });

        // Nasconde loader
        $("#loader-overlay").hide();

        logMessage(`Ridisegnate ${count} attività dalla cache`);
      }, 100); // 50ms bastano per forzare il rendering del loader
    }



  // =========================
  // API Strava: paginazione + after
  // =========================
  function getActivities(res, page = 1, after = null) {
  const per_page = 30;
  let url = `https://www.strava.com/api/v3/athlete/activities?access_token=${res.access_token}&per_page=${per_page}&page=${page}`;
  if (after && Number(after) > 0) url += `&after=${after}`;

  logMessage(`Chiamata API Strava: page=${page} ${after ? `(after=${after})` : '(tutte)'}`);

  $.getJSON(url)
    .done(function (data) {
      if (!data || data.length === 0) {
        logMessage("Nessuna attività ricevuta su questa pagina");
        return;
      }

      logMessage(`Ricevute ${data.length} attività (page ${page})`);

      const newActs = addNewActivitiesToStorage(data);
      if (newActs.length > 0) {
        logMessage(`Aggiunte ${newActs.length} attività alla cache`);
        
        // Disegna tutte le nuove attività sulla mappa
        newActs.forEach((a, idx) => {
          //aggiunge tipo attività nel filtro
          addOptionInFilterSelect(a.type);
          // FitBounds solo se è la prima polyline della mappa attuale
          renderActivityOnMap(a, Object.keys(polylines).length === 0 && idx === 0);
          renderActivityOnTable(a);
        });
      } else {            
        logMessage("Nessuna delle attività ricevute era nuova");
      }

      // Continua paginazione
      getActivities(res, page + 1, after);
    })
    .fail(function (jqXHR, textStatus, errorThrown) {
      logMessage(`Errore API: ${textStatus}`);
      console.error("getActivities fail:", textStatus, errorThrown);
    });
}

  // Decide cosa scaricare: tutto o solo dopo l'ultima attività in cache
  function fetchNewActivities(res) {
    const latestTs = getLatestSavedTimestamp();
    if (latestTs === 0) {
      logMessage("Cache vuota → scarico tutte le attività");
      getActivities(res, 1, null);
    } else {
      logMessage(`Ultima attività in cache (unix): ${latestTs} → scarico solo attività successive`);
      getActivities(res, 1, latestTs);
    }
  }
  
  // Ridisegna tutte le attività da localStorage
    $('#redrawCacheBtn').on('click', function () {
      logMessage("Ridisegno tutte le attività da localStorage...");
    //nasconde grafici
    $('#chart-container').hide();
    //tipo della attività selezionato
    var type = $('#activityFilter').val();
    // Mostra loader
    $("#loader-overlay").show();

    // Delay per permettere al DOM di aggiornare il loader
    setTimeout(() => {
        // Rimuove tutte le polylines dalla mappa
        Object.values(polylines).forEach(p => {
          if (p && map.hasLayer(p)) map.removeLayer(p);
        });
        polylines = {};

        // Pulisce la tabella
        table.clear().draw();

        // Ridisegna attività da cache
        const saved = getSavedActivities();
        if (saved.length === 0) {
          logMessage("Nessuna attività in cache da ridisegnare");
          return;
        }
        var count = 0;
        saved.forEach((act, idx) => {
          if(type === ''){
          renderActivityOnMap(act, idx === 0); // fitBounds solo sulla prima polyline
          count = saved.length;
        }else if(act.type === type){
            renderActivityOnMap(act, idx === 0); // fitBounds solo sulla prima polyline
            count++;
        }
          renderActivityOnTable(act);
        });

        // Nasconde loader
        $("#loader-overlay").hide();

        logMessage(`Ridisegnate ${count} attività dalla cache`);
        }, 100); // 50ms bastano per forzare il rendering del loader
    });


  // =========================
  // Streams & grafico (click sulla tabella)
  // =========================
  // click link in tabella per mostrare traccia / chart
  $('#activities-table tbody').on('click', 'a.show-track', function (e) {
    e.preventDefault();
    const activityId = $(this).data('id');
    const activityStartDateRaw = $(this).data('date'); // start_date_local ISO

    if (!activityId) return;
    selectedActivityId = activityId;

    //nasconde grafici
    $('#chart-container').show();
    // rimuove tutte le polylines dalla mappa e svuota l’oggetto polylines
    for (const id in polylines) {
      if (polylines[id] && map.hasLayer(polylines[id])) {
        map.removeLayer(polylines[id]);
      }
    }
    // svuota l’oggetto
    polylines = {};


    // aggiungi la summary polyline (se presente nel cache) oppure verrà aggiunta dopo fetch streams
    if (polylines[activityId]) {
      polylines[activityId].addTo(map);
      map.fitBounds(polylines[activityId].getBounds());
    }

    // fetch streams per activity
    fetchActivityStreams(activityId, activityStartDateRaw);
    // evidenzia link attivo
    $('a.show-track').removeClass('active-track');
    $(this).addClass('active-track');
  });

  // Richiesta streams (latlng, time, heartrate, velocity_smooth, altitude, grade_smooth)
  function fetchActivityStreams(activityId, startDateISO) {
    if (!access_token) {
      logMessage("Token non disponibile. Riprovare l'autenticazione.");
      return;
    }
    const keys = 'latlng,heartrate,time,velocity_smooth,altitude,grade_smooth,grade,distance';
    $.ajax({
      url: `https://www.strava.com/api/v3/activities/${activityId}/streams`,
      type: 'GET',
      data: { access_token: access_token, keys: keys, key_by_type: true },
      success: function (streams) {
        if (!streams || (!streams.time && !streams.latlng)) {
          logMessage("Streams non disponibili per questa attività");
          $('#chart-container').html('<p class="text-warning">Nessun dato disponibile</p>');
          return;
        }
        logMessage(`Streams ricevuti: tipi = ${Object.keys(streams).join(', ')}`);

        // rimuovi polyline stream precedente
        if (activeStreamPolyline && map.hasLayer(activeStreamPolyline)) map.removeLayer(activeStreamPolyline);

        // costruisci la polyline ad alta risoluzione dal latlng (se presente)
        const coordinate = (streams.latlng && streams.latlng.data) ? streams.latlng.data : [];
        if (coordinate.length > 0) {
          activeStreamPolyline = L.polyline(coordinate, { color: 'blue', weight: 2, opacity: 0.5 }).addTo(map);
          polylines[activityId] = activeStreamPolyline;
          try { map.fitBounds(activeStreamPolyline.getBounds()); } catch (e) { /* ignore */ }
        }



        // prepara i dati per il grafico
        const times = streams.time && streams.time.data ? streams.time.data : [];
        const heartrates = streams.heartrate && streams.heartrate.data ? streams.heartrate.data : [];
        const speeds = streams.velocity_smooth && streams.velocity_smooth.data
                       ? streams.velocity_smooth.data.map(v => Math.round(v * 3.6))
                       : [];
        const altitudes = streams.altitude && streams.altitude.data ? streams.altitude.data : [];
        const grade = streams.grade_smooth && streams.grade_smooth.data ? streams.grade_smooth.data
                    : (streams.grade && streams.grade.data ? streams.grade.data : []);
        // distance optional
        const distances = streams.distance && streams.distance.data ? streams.distance.data : [];

        renderActivityChart({ times, heartrates, speeds, altitudes, grade, distances }, startDateISO, coordinate);
      },
      error: function (jqXHR, textStatus, errorThrown) {
        logMessage(`Errore fetching streams: ${textStatus}`);
        console.error("fetchActivityStreams error:", textStatus, errorThrown);
      }
    });
  }

  // Render grafico Highcharts + highlight sulla mappa
  function renderActivityChart(streamsObj, activityStartISO, coordinate) {
    const times = streamsObj.times || [];
    const heartrates = streamsObj.heartrates || [];
    const speeds = streamsObj.speeds || [];
    const altitudes = streamsObj.altitudes || [];
    const grade = streamsObj.grade || [];

    // timestamps leggibili (usando start_date_local come riferimento)
    const startDateObj = new Date(activityStartISO);
    const pointDateTimes = times.map(sec => {
      const d = new Date(startDateObj.getTime() + sec * 1000);
      return d.toLocaleString('it-IT');
    });

    // crea o riusa highlight marker
    if (!highlightMarker) {
      highlightMarker = L.circleMarker([0, 0], { radius: 6, color: '#ff0000', fillColor: '#ff0000', opacity: 0, fillOpacity: 0 }).addTo(map);
    }

    Highcharts.chart('chart-container', {
      chart: { type: 'spline', zoomType: 'x', panning: true, panKey: 'shift' },
      title: { text: `${(new Date(activityStartISO)).toLocaleString()}` },
      xAxis: { categories: times.map(formatTime), title: { text: 'Tempo (hh:mm)' }, tickInterval: 10 },
      yAxis: [
        { title: { text: 'Frequenza cardiaca (BPM)' }, min: 0 },
        { title: { text: 'Velocità (km/h)' }, opposite: true, min: 0 },
        { title: { text: 'Altitudine (m)' }, min: 0, gridLineDashStyle: 'Dash' },
        { title: { text: 'Pendenza (%)' }, opposite: true, min: -50, max: 50 }
      ],
      tooltip: {
        shared: true, crosshairs: true,
        formatter: function () {
          const index = (this.points && this.points[0] && this.points[0].point) ? this.points[0].point.index : 0;
          let s = `<b>${pointDateTimes[index] || ''}</b><br/>`;
          this.points.forEach(point => {
            if (point.series.name === 'Frequenza cardiaca') s += `${point.series.name}: ${point.y} BPM<br/>`;
            else if (point.series.name === 'Velocità') s += `${point.series.name}: ${point.y} km/h<br/>`;
            else if (point.series.name === 'Altitudine') s += `${point.series.name}: ${point.y} m<br/>`;
            else if (point.series.name === 'Pendenza') s += `${point.series.name}: ${point.y} %<br/>`;
          });
          return s;
        }
      },
      plotOptions: {
        series: {
          point: {
            events: {
              mouseOver: function () {
                const idx = this.index;
                if (coordinate && coordinate[idx]) {
                  highlightMarker.setLatLng(coordinate[idx]);
                  highlightMarker.setStyle({ opacity: 1, fillOpacity: 0.9 });
                }
              },
              mouseOut: function () {
                highlightMarker.setStyle({ opacity: 0, fillOpacity: 0 });
              }
            }
          }
        }
      },
      series: [
        { name: 'Frequenza cardiaca', data: heartrates, yAxis: 0, color: '#e63946',  zIndex: 2 },
        { name: 'Velocità', data: speeds, yAxis: 1, color: '#1d3557',  zIndex: 2 },
        { name: 'Altitudine', data: altitudes, yAxis: 2, 
            
//            color: '#c7c9ca',       // Colore della linea
//            fillColor: '#c7c9ca',
             color: {
                    linearGradient: {
                        x1: 0,
                        y1: 0,
                        x2: 0,
                        y2: 1
                    },
                    stops: [
                        [0, '#808080'],
                        [0.7, '#c7c9ca']
                    ]
                },

           type: 'area', 
           zIndex: 1
          },
        { name: 'Pendenza', data: grade, yAxis: 3, color: '#ff9900' ,  zIndex: 2}
      ],
      credits: { enabled: false }
    });
  }

  // =========================
  // Utilità formattazione
  // =========================
  function formatTime(seconds) {
    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }

  // =========================
  // Filtro tipo attività (se esiste select #activityFilter)
  // =========================
  $('#activityFilter').on('change', function () {
    const val = $(this).val();
    loadAndRenderCache(val);
    table.column(2).search(val ? '^' + val + '$' : '', true, false).draw();
  });

  // Bottone svuota cache (se presente)
  $('#clearCacheBtn').on('click', function () {
    if (!confirm('Vuoi svuotare la cache delle attività?')) return;
    clearSavedActivities();
    table.clear().draw();
    Object.values(polylines).forEach(p => { if (p && map.hasLayer(p)) map.removeLayer(p); });
    polylines = {};
    logMessage("Cache cancellata manualmente");
  });

  // =========================
  // Autenticazione (refresh token) e avvio flusso
  // =========================
  function reAuthorize() {
    $.ajax({
      type: 'POST',
      url: AUTH_LINK,
      data: {
        client_id: '170267',
        client_secret: '2a763ae8a5952c806420030f883b6d9c611c31a0',
        refresh_token: '1d09f95e93975a8d9d131e481b15b01ef63428b6',
        grant_type: 'refresh_token'
      }
    }).done(function (res) {
      access_token = res.access_token;
      logMessage("Autenticazione OK, token ottenuto");
      
      // prima mostra cache per renderizzazione rapida
      loadAndRenderCache("");

      // poi scarica solo le nuove attività (se presenti) usando 'after'
      fetchNewActivities(res);
    }).fail(function (jqXHR, textStatus, errorThrown) {
      logMessage(`Errore autenticazione: ${textStatus}`);
      console.error("reAuthorize failed:", textStatus, errorThrown);
    });
  }

  // avviare tutto
  reAuthorize();
});
