
const auth_link = "https://www.strava.com/oauth/token"
 
function getActivites(res){

    const activities_link = `https://www.strava.com/api/v3/athlete/activities?access_token=${res.access_token}&startDateLocal=2025-01-01T00:00:00+01:00`
    
    fetch(activities_link)
        .then((res) => res.json())
        .then(function (data){
            var color;
            var weight;
            var map = L.map('map').setView([45.486640067047055, 12.25674924342232], 11);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            console.log(data.length);
            for(var x=0; x<data.length; x++){

                console.log(data[x].map.summary_polyline)
                var coordinates = L.Polyline.fromEncoded(data[x].map.summary_polyline).getLatLngs()
               
                
                if(x === 0){
                    color = "red"; 
                    weight = 2;
                }else{
                    color = "blue"; 
                    weight = 1;                    
                }

                L.polyline(

                    coordinates,
                    {
                        color: color,
                        weight: weight,
                        opacity:.7,
                        lineJoin:'round'
                    }

                ).addTo(map)
            }

        }
        )
}

    
function reAuthorize() {
    fetch(auth_link, {
        method: 'post',

        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({

            client_id: '170267',
            client_secret: '2a763ae8a5952c806420030f883b6d9c611c31a0',
            refresh_token: '1d09f95e93975a8d9d131e481b15b01ef63428b6',    
            grant_type: 'refresh_token'

        })

    }).then(res => res.json())
        .then(res => getActivites(res));
}

reAuthorize();