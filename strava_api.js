
const auth_link = "https://www.strava.com/oauth/token"
var map = L.map('map')
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
 
function getActivites(res){
//    const d = new Date();
//    const formatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit',   hour: '2-digit', minute: '2-digit', second: '2-digit' });
//    var text = formatter.format(d);

    var now = moment().format("YYYY-MM-DDTHH:MM:SS");
    var d=new Date(now);
    var text = d.getTime()/1000;    
    var per_page = 50;
    
    const activities_link = "https://www.strava.com/api/v3/athlete/activities?"
                            +"access_token="+res.access_token
                            +"&before="+text
                            +"&per_page="+per_page;
       
    console.log(res);
    fetch(activities_link)
        .then((res) => res.json())
        .then(function (data){
            var color;
            var weight;
            console.log(data);
            //console.log(data[0].start_latlng);
            
            map.setView([data[0].start_latlng[0], data[0].start_latlng[1]], 15);
            // Render the table
            const container = document.getElementById('table-container');
            const table = generateTable(data);
            if (table) container.appendChild(table);
            for(var x=0; x<data.length; x++){

                //console.log(data[x].map.summary_polyline)
                var coordinates = L.Polyline.fromEncoded(data[x].map.summary_polyline).getLatLngs()
               
                
//                if(x === 0){
//                    color = "red"; 
//                    weight = 2;
//                    console.log(data[0].start_date_local);
//                }else{
//                    color = "blue"; 
//                    weight = 1;                    
//                }

                L.polyline(

                    coordinates,
                    {
                        color: blue,
                        weight: 1,
                        opacity:.7,
                        lineJoin:'round'
                    }

                ).addTo(map)
            }

        }
        )
}

function getActivity(res, id){
    
    
    const activity_link = 'https://www.strava.com/api/v3/activities/'+id+'?access_token='+res.access_token;
    
            
    fetch(activity_link)
    .then((res) => res.json())
    .then(function (data){
       map.setView([data.start_latlng[0], data.start_latlng[1]], 15);
       

        console.log(data.map.summary_polyline)
        var coordinates = L.Polyline.fromEncoded(data.map.summary_polyline).getLatLngs()

        L.polyline(

            coordinates,
            {
                color: 'red',
                weight: '2',
                opacity:.7,
                lineJoin:'round'
            }

        ).addTo(map) //}
    });
}
// Function to generate the table
function generateTable(data) {
  if (!data || data.length === 0) return "No data available.";
  // Create the table element
  const table = document.createElement('table');
  
  // Generate table headers
  const headerRow = document.createElement('tr');
//  const keys = Object.keys(data[0]); // Get keys from the first object
//  console.log(keys);
  const keys = ["id","name","type","sport_type","start_date_local","distance",]; // Get keys from the first object
  keys.forEach(key => {
    const th = document.createElement('th');
    th.textContent = key.charAt(0).toUpperCase() + key.slice(1); // Capitalize header
    headerRow.appendChild(th);
  });
  table.appendChild(headerRow);
  // Generate table rows
  data.forEach(item => {
    const row = document.createElement('tr');
    keys.forEach(key => {
      const td = document.createElement('td');
      if(key == 'id'){
        const x = document.createElement("A");
        const t = document.createTextNode(item[key]);
        x.setAttribute("onclick", "activity(event)");
        x.setAttribute("id", item[key]);
        x.setAttribute("href", "#"+item[key]);
        x.appendChild(t);
        td.appendChild(x);
      }else{
        td.textContent = item[key] || ""; // Fill empty fields with blank
      } 
      row.appendChild(td);
    });
    table.appendChild(row);
  });
  return table;
} 

function createLink(id) {
  
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

function singleAuthorize(id) {
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
               .then(res => getActivity(res, id));
}



function activity(event){
    var element = event.target;
    var id = element.getAttribute("id");
    singleAuthorize(id);
}

reAuthorize();

