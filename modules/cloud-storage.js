// UI module to save and load .map to cloud storage
"use strict";

const CLOUD_BASE = "https://localhost:8443";

const cloudSession = (function() {
    let currentSeed;
    let currentFilename;
    let lastSuccessFilename;
    let csrfToken;

    return {
        getCurrentSeed: () => currentSeed,
        getCurrentFilename: () => currentFilename,
        getLastSuccessFilename: () => lastSuccessFilename,
        getCsrfToken: () => csrfToken,
        setCurrentSeed: () =>  currentSeed = seed,
        setDefaultFilename: () => currentFilename = mapName.value,
        setNewFilename: newFilename => currentFilename = newFilename,
        setLastSuccessFilename: () => lastSuccessFilename = currentFilename,
        setCsrfToken: newCsrfToken => csrfToken = newCsrfToken
    };
})();

const cloudPagination = (function() {
    let sortingOrder = false;
    return {
        getSortingOrder: () => sortingOrder,
        setSortingOrder: newSortingOrder => {
            if (typeof newSortingOrder !== "boolean") throw "Sorting order variable must be boolean!";
            sortingOrder = newSortingOrder;
        }
    };
})();

checkAuthorization();

// Check first whether user is logged in (executes on every page loading!)
function checkAuthorization(callback) {
    const retrievedUser = JSON.parse(localStorage.getItem("fmgUser"));

    // Unauthorized user (re)loads page
    if (!callback && retrievedUser === null) {console.log("User is unauthorized"); return;} 

    // Authorized user reloads page  
    else if (!callback && retrievedUser !== null) {
        fetch(CLOUD_BASE + "/user-data", {method: "GET", mode: "cors", credentials: "include"})
        .then(function (response) {
            cloudSession.setCsrfToken(response.headers.get("X-XSRF-TOKEN"));
        });
    }

    // Unauthorized user clicks on cloud button
    else if (callback && retrievedUser === null) login(callback);

    // Authorized user clicks on cloud button
    else if (callback && retrievedUser !== null) callback();
}

// Login for the first time
async function login(callback) {
    if (!callback) throw "Login function cannot be called without a callback function!";

    $("#selectLogin").dialog({title: "Login with", resizable: false, width: "27em", 
      position: {my: "center", at: "center", of: "svg"},
      buttons: {Close: function() {$(this).dialog("close");}}
    });

    const url = await selectLogin();
    const loginPopup = window.open("", "loginPopup", "height=600,width=450");
    fetch(CLOUD_BASE + "/fmg-login", {method: "GET", mode: "cors", credentials: "include"})
    .then(function() {
        loginPopup.location.href = CLOUD_BASE + url;
        if (window.focus) loginPopup.focus();
        const timer = setInterval(function() {
            if (loginPopup.closed) {
                fetch(CLOUD_BASE + "/user-data", {method: "GET", mode: "cors", credentials: "include"})
                .then(function (response) {
                    cloudSession.setCsrfToken(response.headers.get("X-XSRF-TOKEN"));                   
                    
                    // User authorized successfully
                    if (response.ok) {
                        clearInterval(timer);
                        $("#selectLogin").dialog("close");
                        response.json().then(function (user) {localStorage.setItem("fmgUser", JSON.stringify(user));});
                        callback();
                    
                    // User decided to close login popup without authorization
                    } else {
                        clearInterval(timer);
                        $("#selectLogin").dialog("close");
                        tip("Please authorize to get access to the cloud storage", false, "error");
                        console.log("User did not authorize.");
                    }
                });
            }
        }, 500);
    });
}

// Select a way to login
function selectLogin() {
    return new Promise (resolve =>
        document.getElementById("selectLogin").addEventListener("click", function (event) {
            const id = event.target.id;
            if (id === "google") resolve("/oauth2/authorization/google");
            else if (id === "facebook") resolve("/oauth2/authorization/facebook");
            else if (id === "github") resolve("/oauth2/authorization/github");
        })
    );
}

// Show cloud menu
function showCloudMenu(page = 0) {
    const pageSize = 5;
    const sortBy = document.getElementById("mapsSorting").value;
    const timeZoneOffset = -(new Date().getTimezoneOffset());
    let mapData = "";
    let sortOrder = cloudPagination.getSortingOrder() ? "asc" : "desc";

    // Timeout is set to retrieve user from localStorage since the latter is asynchronous
    setTimeout(function() {
        const retrievedUser = JSON.parse(localStorage.getItem("fmgUser"))
        $("#cloudMenu").dialog({
            title: `${retrievedUser.name}'s cloud storage`,
            resizable: false,
            width: 400,
            height: 265,
            buttons: {
                Logout: function() {logout();},
                Close: function() {$(this).dialog("close");}
            }
        });

        fetch(CLOUD_BASE + `/maps?page=${page}&size=${pageSize}&sort=${sortBy},${sortOrder}`, {method: "GET", mode: "cors", credentials: "include"})
        .then(function (response) {return response.json();})
        .then(function (data) {
            if (data.content.length === 0) mapData = "<h3>You have no maps in cloud storage yet</h3>";
            else {
                if (data.page.totalPages > 1) showPagination(data.page.totalPages, page);
                else document.getElementById("cloudPagination").innerHTML = "";
                data.content.forEach(map => mapData += "<tr>" + 
                                                       "<td><a href='#' data-tip='Click to download map to the FMG' onclick='downloadCloudMap(\"" + map.filename + "\")'>" + map.filename + "</a></td>" +
                                                       "<td>" + new Date(Date.parse(map.updated) + timeZoneOffset * 60 * 1000).customFormat("#YYYY#-#MM#-#DD# #hhhh#:#mm#:#ss#") + "</td>" +
                                                       "<td><button onclick='showSaveAsPane(" + JSON.stringify(map) + ")'>Rename</button></td>" + 
                                                       "<td><button onclick='deleteCloudMap(" + JSON.stringify(map) + ")'>Delete</button></td>" +
                                                       "</tr>");
            }
            document.getElementById("cloudMapsData").innerHTML = mapData;
        });
    }, 50);
}

// Change sorting order
function changeSortOrder() {
    cloudPagination.setSortingOrder(!cloudPagination.getSortingOrder());
    showCloudMenu();
}

// Show pagination if necessary
function showPagination(totalPages, page) {
    if (totalPages === undefined || page === undefined) throw "A number of pages and selected page should be provided!";
    
    const pageLimit = 4;
    let pageNum = 1;
    let pageTag;
    let flag;
    
    if (page === 0) pageTag = "<a class='disabled'>&laquo;</a>";
    else pageTag = "<a onclick='showCloudMenu(" + (page - 1) + ")'>&laquo;</a>";

    if (totalPages <= pageLimit) {
        for (; pageNum <= totalPages; pageNum++) {
            if (pageNum - 1 === page) pageTag += "<a class='active' onclick='showCloudMenu(" + (pageNum - 1) + ")'>" + pageNum + "</a>";
            else pageTag += "<a onclick='showCloudMenu(" + (pageNum - 1) + ")'>" + pageNum + "</a>";
        }
    } else {
        if (page > pageLimit) {
            pageTag += "<a onclick='showCloudMenu(" + 0 + ")'>" + 1 + "</a>";
            pageTag += "<a>...</a>";
            pageNum = page - 1;
        }
        for (; pageNum <= totalPages; pageNum++) {
            flag = page < pageLimit / 2 ? pageLimit : page + pageLimit;
            if (pageNum === flag) {
                pageTag += "<a>...</a>";
                pageTag += "<a onclick='showCloudMenu(" + (totalPages - 1) + ")'>" + totalPages + "</a>";
                break;
            }
            if (pageNum - 1 === page) pageTag += "<a class='active' onclick='showCloudMenu(" + (pageNum - 1) + ")'>" + pageNum + "</a>";
            else pageTag += "<a onclick='showCloudMenu(" + (pageNum - 1) + ")'>" + pageNum + "</a>";
        }
    }

    if (page === totalPages - 1) pageTag += "<a class='disabled'>&raquo;</a>";
    else pageTag += "<a onclick='showCloudMenu(" + (page + 1) + ")'>&raquo;</a>";
    document.getElementById("cloudPagination").innerHTML = pageTag;
}

// Download .map from cloud
function downloadCloudMap(cloudMapFilename) {
    const downloadLink = CLOUD_BASE + "/download/" + cloudMapFilename;
    const headers = new Headers({
        "X-XSRF-TOKEN": cloudSession.getCsrfToken(),
        "Accept": "application/json",
        "Content-Type": "application/json"
    });

    alertMessage.innerHTML = `Are you sure you want to download ${cloudMapFilename}?`;
    $("#alert").dialog({title: "Download map", resizable: false, width: "27em", 
      position: {my: "center", at: "center", of: "svg"},
      buttons: {
          Yes: function() {
            loadMapFromURL(downloadLink, headers, false);
            $(this).dialog("close");
          },
          No: function() {$(this).dialog("close");}
    }});
}

// Check if .map is being rewritten
function checkRewriting(newFilename) {
    if (customization) {tip("Map cannot be saved when edit mode is active, please exit the mode and retry", false, "error"); return;}
    if (cloudSession.getCurrentSeed() !== seed) {cloudSession.setCurrentSeed(); cloudSession.setDefaultFilename();}
    if (newFilename) cloudSession.setNewFilename(newFilename);
    if (!cloudSession.getCurrentFilename()) {tip("Please specify a name of the map", false, "error"); return;}

    const headers = new Headers({"X-XSRF-TOKEN": cloudSession.getCsrfToken()});

    fetch(CLOUD_BASE + "/maps?filename=" + cloudSession.getCurrentFilename(), {method: "Get", headers, mode: "cors", credentials: "include"})
    .then(function (response) {
        response.json().then(function (existedMap) {
            console.log(existedMap.content.length);
            if (existedMap.content.length > 0) {
                alertMessage.innerHTML = `Are you sure you want to rewrite ${cloudSession.getCurrentFilename()}?`;
                $("#alert").dialog({title: "Rewrite map", resizable: false, width: "27em", 
                  position: {my: "center", at: "center", of: "svg"},
                  buttons: {
                      Yes: function() {s3Upload();},
                      No: function() {$(this).dialog("close");}
                }});
            } else {
                s3Upload();
            }
        });
    });
}

// Upload .map to AWS S3
async function s3Upload() {
    console.time("saveToCloud");
    const headers = new Headers({"X-XSRF-TOKEN": cloudSession.getCsrfToken()});
    const blob = await getMapData();
    const formData = new FormData();
    formData.append("file", blob, cloudSession.getCurrentFilename());
    formData.append("map", new Blob([JSON.stringify({
                    "fileId": cloudSession.getCurrentSeed(),
                    "filename": cloudSession.getCurrentFilename(),
                    "version": version})], 
                    {type: "application/json"}));

    fetch(CLOUD_BASE + "/upload", {method: "POST", headers, body: formData, mode: "cors", credentials: "include"})
    .then(function (response) {
        response.json().then(function (uploadedMap) {
            if (response.status !== 201) {
                console.log(uploadedMap.message);
                cloudSession.setNewFilename(cloudSession.getLastSuccessFilename());
                console.timeEnd("saveToCloud");
                alertMessage.innerHTML = uploadedMap.message +  `. Your map will be stored as ${cloudSession.getLastSuccessFilename()}.map by next quick save`;
                $("#alert").dialog({title: "Denied", resizable: false, width: "27em", 
                  position: {my: "center", at: "center", of: "svg"},
                  buttons: {Close: function() {$(this).dialog("close");}}
                });
            } else {
                cloudSession.setNewFilename(uploadedMap.filename);
                cloudSession.setLastSuccessFilename();
                console.timeEnd("saveToCloud");
                alertMessage.innerHTML = `${cloudSession.getCurrentFilename()}.map is saved to cloud successfully.
                                          You have ${uploadedMap.freeSlots} more memory slots for this map. </br>
                                          Link to map: <a href=${uploadedMap.downloadLink}>${uploadedMap.downloadLink}</a>`;
                $("#alert").dialog({title: "Success", resizable: false, width: "27em", 
                  position: {my: "center", at: "center", of: "svg"},
                  buttons: {Close: function() {$(this).dialog("close"); showCloudMenu();}}
                });
            }})
            .catch(function (err) {console.log(err); console.timeEnd("saveToCloud");});
    });
}

// Rename filename of the .map
function renameCloudMap(cloudMap, newFilename) {
    const downloadLink = cloudMap.links[0].href;
    const updatedCloudMap = {
        fileId: cloudMap.fileId,
        filename: newFilename,
        version: cloudMap.version
    };
    const headers = new Headers({
        "X-XSRF-TOKEN": cloudSession.getCsrfToken(),
        "Accept": "application/json",
        "Content-Type": "application/json"
    });

    fetch(downloadLink, {method: "PUT", headers, body: JSON.stringify(updatedCloudMap), mode: "cors", credentials: "include"})
    .then(function (response) {
        if (response.status !== 201) {
            response.json().then(function (data) {
                tip(`${data.message}`, false, "error");
                return;
            });
        } else {
            if (cloudMap.fileId === cloudSession.getCurrentSeed()) cloudSession.setNewFilename(newFilename);
            $("#alert").dialog("close");
            showCloudMenu();
        }
    });
}

// Show pane to insert a map's name for saving to cloud
function showSaveAsPane(cloudMap) {
    if (customization) {tip("Map cannot be saved when edit mode is active, please exit the mode and retry", false, "error"); return;}

    const pattern = /^[-_A-Za-z0-9 ]+$/;
    let placeholder;
    if (!cloudMap) placeholder = !cloudSession.getCurrentFilename() || cloudSession.getCurrentSeed() !== seed ? mapName.value : cloudSession.getCurrentFilename();
    else placeholder = cloudMap.filename;
    alertMessage.innerHTML = `Enter a name for your .map file: <input id="cloudMapName" type="text" style="width:24em" placeholder="${placeholder}" />`;
    $("#alert").dialog({resizable: false, title: "Provide a name for a map", width: "27em",
      buttons: {
          Save: function() {
              const newFilename = cloudMapName.value;
              if (newFilename.length === 0) {
                  tip("Please provide a name for a map", false, "error");
                  return;
              } else if (!pattern.test(newFilename)) {
                  tip("Name of the map can consist only of -, _, A-Z, a-z, 0-9, and spaces", false, "error");
                  return;
              }
              if (!cloudMap) {checkRewriting(newFilename);}
              else renameCloudMap(cloudMap, newFilename);
          },
          Reset: function() {
              cloudMapName.value = "";
          },
          Cancel: function() {$(this).dialog("close");}
    }});
}

// Delete .map file
function deleteCloudMap(cloudMap) {
    const deleteLink = cloudMap.links[0].href;
    const headers = new Headers({
        "X-XSRF-TOKEN": cloudSession.getCsrfToken(),
        "Accept": "application/json",
        "Content-Type": "application/json"
    });

    alertMessage.innerHTML = `Are you sure you want to delete ${cloudMap.filename}?`;
    $("#alert").dialog({title: "Delete map", resizable: false, width: "27em", 
      position: {my: "center", at: "center", of: "svg"},
      buttons: {
          Yes: function() {
            fetch(deleteLink, {method: "DELETE", headers, mode: "cors", credentials: "include"})
            .then(function (response) {
                if (!response.ok) {
                    response.json().then(function (data) {
                        console.log(data.message);
                        alertMessage.innerHTML = "Something get wrong while deleting a map. Please try again later!";
                        $("#alert").dialog({title: "Error", resizable: false, width: "27em", 
                          position: {my: "center", at: "center", of: "svg"},
                          buttons: {Close: function() {$(this).dialog("close");}
                        }});
                    });
                } else {
                    alertMessage.innerHTML = `${cloudMap.filename} deleted from the cloud successfully`;
                    $("#alert").dialog({title: "Success", resizable: false, width: "27em", 
                      position: {my: "center", at: "center", of: "svg"},
                      buttons: {Ok: function() {$(this).dialog("close"); showCloudMenu();}
                    }});
                }
            });
          },
          No: function() {$(this).dialog("close");}
    }});
}

// Logout
function logout() {
    const headers = new Headers({"X-XSRF-TOKEN": cloudSession.getCsrfToken()});
    if (JSON.parse(localStorage.getItem("fmgUser")) !== null) localStorage.removeItem("fmgUser");
    fetch(CLOUD_BASE + "/logout", {method: "POST", headers, mode: "cors", credentials: "include"})
    .then(function (response) {
        if (response.ok || response.status === 401) {
            $("#cloudMenu").dialog("close");
        } else {
            response.json().then(function(data) {
                console.log(data.message);
                alertMessage.innerHTML = "Something get wrong while logout. Please try again later!";
                $("#alert").dialog({title: "Error", resizable: false, width: "27em", 
                  position: {my: "center", at: "center", of: "svg"},
                  buttons: {Close: function() {$(this).dialog("close");}
                }});
            });
        }})
        .catch(function (err) {console.log(err);});
}

//*** This code is copyright 2002-2016 by Gavin Kistner, !@phrogz.net
//*** It is covered under the license viewable at http://phrogz.net/JS/_ReuseLicense.txt
Date.prototype.customFormat = function(formatString){
    var YYYY,YY,MMMM,MMM,MM,M,DDDD,DDD,DD,D,hhhh,hhh,hh,h,mm,m,ss,s,ampm,AMPM,dMod,th;
    YY = ((YYYY=this.getFullYear())+"").slice(-2);
    MM = (M=this.getMonth()+1)<10?('0'+M):M;
    MMM = (MMMM=["January","February","March","April","May","June","July","August","September","October","November","December"][M-1]).substring(0,3);
    DD = (D=this.getDate())<10?('0'+D):D;
    DDD = (DDDD=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][this.getDay()]).substring(0,3);
    th=(D>=10&&D<=20)?'th':((dMod=D%10)==1)?'st':(dMod==2)?'nd':(dMod==3)?'rd':'th';
    formatString = formatString.replace("#YYYY#",YYYY).replace("#YY#",YY).replace("#MMMM#",MMMM).replace("#MMM#",MMM).replace("#MM#",MM).replace("#M#",M).replace("#DDDD#",DDDD).replace("#DDD#",DDD).replace("#DD#",DD).replace("#D#",D).replace("#th#",th);
    h=(hhh=this.getHours());
    if (h==0) h=24;
    if (h>12) h-=12;
    hh = h<10?('0'+h):h;
    hhhh = hhh<10?('0'+hhh):hhh;
    AMPM=(ampm=hhh<12?'am':'pm').toUpperCase();
    mm=(m=this.getMinutes())<10?('0'+m):m;
    ss=(s=this.getSeconds())<10?('0'+s):s;
    return formatString.replace("#hhhh#",hhhh).replace("#hhh#",hhh).replace("#hh#",hh).replace("#h#",h).replace("#mm#",mm).replace("#m#",m).replace("#ss#",ss).replace("#s#",s).replace("#ampm#",ampm).replace("#AMPM#",AMPM);
};