$(document).ready(function() {

    const auth_link = "https://www.strava.com/oauth/token";
    var map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Mostra un overlay durante le chiamate AJAX
    $(document).ajaxStart(function() {
        $("#loader-overlay").show();
    });

    $(document).ajaxStop(function() {
        $("#loader-overlay").hide();
    });

    function getActivities(res, page) {
        var per_page = 10;
        var activities_link = "https://www.strava.com/api/v3/athlete/activities?"
                            + "access_token=" + res.access_token
                            + "&per_page=" + per_page
                            + "&page=" + page;

        $.getJSON(activities_link)
            .done(function(data) {
                if (data.length !== 0) {
                    map.setView([data[0].start_latlng[0], data[0].start_latlng[1]], 15);

                    $.each(data, function(index, activity) {
                        if (activity.map && activity.map.summary_polyline) {
                            var coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
                            L.polyline(coordinates, {
                                color: 'red',
                                weight: 4,
                                opacity: 0.7,
                                lineJoin: 'round'
                            }).addTo(map);
                        }
                    });

                    getActivities(res, page + 1);
                }
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Errore durante il caricamento delle attività:", textStatus, errorThrown);
                alert("Impossibile caricare le attività. Riprova più tardi.");
            });
    }

    function reAuthorize() {
        $.ajax({
            type: 'POST',
            url: auth_link,
            data: {
                client_id: '111203',
                client_secret: 'f6e1c3e3d9f77e9e3e2268f65f02cc7f06a8cb41',
                refresh_token: '7b9a520f3c98c15f9165cf92f1c74dd1df1637b6',
                grant_type: 'refresh_token'
            }
        })
        .done(function(res) {
            console.log("Autenticazione riuscita", res);
            getActivities(res, 1);
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Errore durante l'autenticazione:", textStatus, errorThrown);
            alert("Autenticazione fallita. Controlla le tue credenziali.");
        });
    }

    reAuthorize();

});
