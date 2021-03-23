// UI module to save and load .map to cloud storage
"use strict";

const FMG_BASE = "https://azgaar.github.io/Fantasy-Map-Generator";
const CLOUD_BASE = "https://localhost:8443";

const cloudSession = (function () {
    let currentSeed;
    let currentFilename;
    let lastSuccessFilename;
    let csrfToken;
    let isQuickSave;

    return {
        getCurrentSeed: () => currentSeed,
        getCurrentFilename: () => currentFilename,
        getLastSuccessFilename: () => lastSuccessFilename,
        getCsrfToken: () => csrfToken,
        getIsQuickSave: () => isQuickSave,
        setCurrentSeed: () => currentSeed = seed,
        setDefaultFilename: () => currentFilename = mapName.value,
        setNewFilename: newFilename => currentFilename = newFilename,
        setLastSuccessFilename: () => lastSuccessFilename = currentFilename,
        setCsrfToken: newCsrfToken => csrfToken = newCsrfToken,
        setIsQuickSave: newIsQuickSave => isQuickSave = newIsQuickSave
    };
})();

const cloudPagination = (function () {
    let sortingField = "updated";
    let sortingOrder = false;
    let sortingIcon = "";

    return {
        getSortingField: () => sortingField,
        setSortingField: newSortingField => sortingField = newSortingField,
        getSortingOrder: () => sortingOrder,
        setSortingOrder: newSortingOrder => {
            if (typeof newSortingOrder !== "boolean") throw "Sorting order variable must be boolean!";
            sortingOrder = newSortingOrder;
        },
        getSortingIcon: () => sortingIcon,
        setSortingIcon: newSortingIcon => sortingIcon = newSortingIcon
    };
})();

checkAuthorization();

// Check first whether user is logged in (executes on every page loading!)
function checkAuthorization(callback) {
    const retrievedUser = JSON.parse(localStorage.getItem("fmgUser"));

    // Unauthorized user (re)loads page
    if (!callback && retrievedUser === null) { console.log("User is unauthorized"); return; }

    // Authorized user reloads page  
    else if (!callback && retrievedUser !== null) {
        fetch(CLOUD_BASE + "/user-data", { method: "GET", mode: "cors", credentials: "include" })
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

    $("#selectLogin").dialog({
        title: "Login with", resizable: false, width: "27em",
        position: { my: "center", at: "center", of: "svg" },
        buttons: { Close: function () { $(this).dialog("close"); } }
    });

    const url = await selectLogin();
    const loginPopup = window.open("", "loginPopup", "height=600,width=450");
    fetch(CLOUD_BASE + "/fmg-login", { method: "GET", mode: "cors", credentials: "include" })
        .then(function () {
            loginPopup.location.href = CLOUD_BASE + url;
            if (window.focus) loginPopup.focus();
            const timer = setInterval(function () {
                if (loginPopup.closed) {
                    fetch(CLOUD_BASE + "/user-data", { method: "GET", mode: "cors", credentials: "include" })
                        .then(function (response) {
                            cloudSession.setCsrfToken(response.headers.get("X-XSRF-TOKEN"));

                            // User authorized successfully
                            if (response.ok) {
                                clearInterval(timer);
                                $("#selectLogin").dialog("close");
                                response.json().then(function (user) { localStorage.setItem("fmgUser", JSON.stringify(user)); });
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
    return new Promise(resolve =>
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
    const pageSize = 3;
    const sortBy = cloudPagination.getSortingField();
    const filenameSortIcon = sortBy === "filename" ? cloudPagination.getSortingIcon() : "";
    const dateSortIcon = sortBy === "updated" ? cloudPagination.getSortingIcon() : "";
    const sortOrder = cloudPagination.getSortingOrder() ? "asc" : "desc";
    const timeZoneOffset = -(new Date().getTimezoneOffset());
    let mapData = "";

    fetch(CLOUD_BASE + `/maps?page=${page}&size=${pageSize}&sort=${sortBy},${sortOrder}`, { method: "GET", mode: "cors", credentials: "include" })

        .then(function (response) {
            if (response.status !== 200) { // Session is over, need to relogin
                if (JSON.parse(localStorage.getItem("fmgUser")) !== null) localStorage.removeItem("fmgUser");
                login(showCloudMenu);
                return;
            } else {
                openCloudMenuDialog();
                return response.json();
            }
        })

        .then(function (data) {
            if (!data) return;
            if (data.content.length === 0) mapData = "<h3>You have no maps in cloud storage yet</h3>";
            else {
                if (data.page.totalPages > 1) showPagination(data.page.totalPages, page);
                else document.getElementById("cloudPagination").innerHTML = "";
                mapData += "<thead id='cloudMapsHeader' class='header'>" +
                    "<tr>" +
                    "<td></td>" +
                    "<td id='cloudFilenameSort' data-tip='Click to sort by filename' class='sortable " + filenameSortIcon + "' onclick='changeSortField(" + '"filename"' + ")'>Filename&nbsp;</td>" +
                    "<td id='cloudDateSort' data-tip='Click to sort by date' class='sortable " + dateSortIcon + "' onclick='changeSortField(" + '"updated"' + ")'>Date&nbsp;</td>" +
                    "</tr>" +
                    "</thead>";
                data.content.forEach(map => mapData += "<tr>" +
                    "<td><img src='" + map.thumbnail + "' alt='FMG_cloud_thumbnail' class='cloud-thumb'></td>" +
                    "<td><a href='#' data-tip='Click to download map to the FMG' onclick='downloadCloudMap(\"" + map.filename + "\")'>" + map.filename + "</a></td>" +
                    "<td>" + new Date(Date.parse(map.updated) + timeZoneOffset * 60 * 1000).toLocaleString("es-CL") + "</td>" +
                    "<td><button onclick='showSaveAsPane(" + JSON.stringify(map) + ")'>Rename</button></td>" +
                    "<td><button onclick='deleteCloudMap(" + JSON.stringify(map) + ")'>Delete</button></td>" +
                    "<td><i class='icon-copy' style='font-size:18px' data-tip='Copy share link' onclick='generateShareLink(\"" + map.filename + "\")'></i></td>" +
                    "</tr>");
            }
            document.getElementById("cloudMapsData").innerHTML = mapData;
        });
}

// Just opens dialog
function openCloudMenuDialog() {
    const retrievedUser = JSON.parse(localStorage.getItem("fmgUser"));

    if (!retrievedUser) {
        retrievedUser = "Unknown User";
    }

    $("#cloudMenu").dialog({
        title: `${retrievedUser.name}`,
        resizable: false,
        width: "auto",
        buttons: {
            "Quick save": function () { cloudSession.setIsQuickSave(true); checkAuthorization(checkRewriting); },
            "Save as": function () { cloudSession.setIsQuickSave(false); checkAuthorization(showSaveAsPane) },
            Logout: function () { logout(); },
            Close: function () { $(this).dialog("close"); }
        },
        create: function (event, ui) {
            $(this).css("minWidth", "500px");
        }
    });
}

// Change sorting field
function changeSortField(sortBy) {
    const order = cloudPagination.getSortingOrder();
    let sortingIcon = "icon-sort";
    sortingIcon += sortBy === "updated" ? "-number" : "-name";
    sortingIcon += order ? "-down" : "-up";
    cloudPagination.setSortingField(sortBy);
    cloudPagination.setSortingIcon(sortingIcon);
    cloudPagination.setSortingOrder(!order);
    showCloudMenu();
}

// Generate share link
function generateShareLink(filename) {
    fetch(CLOUD_BASE + `/getShareLink/${filename}`, { method: "GET", mode: "cors", credentials: "include" })
        .then(function (response) { return response.text(); })
        .then(function (data) {
            copyShareLink(data);
        });
}

// Copy share link
function copyShareLink(link) {
    const baseUrl = FMG_BASE + "?maplink=";
    const el = document.createElement("textarea");
    el.value = baseUrl + link;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    tip("Link copied to clipboard");
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
    $("#alert").dialog({
        title: "Download map", resizable: false, width: "27em",
        position: { my: "center", at: "center", of: "svg" },
        buttons: {
            Yes: function () {
                loadMapFromURL(downloadLink, headers, false);
                cloudSession.setNewFilename(cloudMapFilename);
                setTimeout(function () { cloudSession.setCurrentSeed() }, 2000);
                $(this).dialog("close");
            },
            No: function () { $(this).dialog("close"); }
        }
    });
}

// Check if .map is being rewritten
function checkRewriting(newFilename) {
    if (customization) { tip("Map cannot be saved when edit mode is active, please exit the mode and retry", false, "error"); return; }
    if (cloudSession.getCurrentSeed() !== seed) { cloudSession.setCurrentSeed(); cloudSession.setDefaultFilename(); }
    if (newFilename) cloudSession.setNewFilename(newFilename);
    if (!cloudSession.getCurrentFilename()) { tip("Please specify a name of the map", false, "error"); return; }

    const headers = new Headers({ "X-XSRF-TOKEN": cloudSession.getCsrfToken() });

    fetch(CLOUD_BASE + "/maps?filename=" + cloudSession.getCurrentFilename(), { method: "Get", headers, mode: "cors", credentials: "include" })
        .then(function (response) {
            response.json().then(function (existedMap) {
                if (existedMap.content.length > 0) {
                    alertMessage.innerHTML = `Are you sure you want to rewrite ${cloudSession.getCurrentFilename()}?`;
                    $("#alert").dialog({
                        title: "Rewrite map", resizable: false, width: "27em",
                        position: { my: "center", at: "center", of: "svg" },
                        buttons: {
                            Yes: function () { s3Upload(); },
                            No: function () { $(this).dialog("close"); }
                        }
                    });
                } else {
                    s3Upload();
                }
            });
        });
}

// Upload .map to AWS S3
async function s3Upload() {
    console.time("saveToCloud");

    // 1. Create thumbnail
    const thumbnailUrl = await getMapURL("png");
    const thumbnailResoultion = 0.1;
    const thumbnailCanvas = document.createElement("canvas");
    const thumbnailCtx = thumbnailCanvas.getContext("2d");
    thumbnailCanvas.width = svgWidth * thumbnailResoultion;
    thumbnailCanvas.height = svgHeight * thumbnailResoultion;
    const thumbnailImage = new Image();
    thumbnailImage.src = thumbnailUrl;

    thumbnailImage.onload = function () {
        thumbnailCtx.drawImage(thumbnailImage, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
        thumbnailCanvas.toBlob(function (blob) {
            const thumbnailReader = new FileReader();
            thumbnailReader.readAsDataURL(blob);
            thumbnailReader.onloadend = async function () {
                const thumbnail = thumbnailReader.result;

                // 2. Get a map itself and prepare request
                const blob = await getMapData();
                const headers = new Headers({ "X-XSRF-TOKEN": cloudSession.getCsrfToken() });
                const formData = new FormData();

                formData.append("file", blob, cloudSession.getCurrentFilename());
                formData.append("map", new Blob([JSON.stringify({
                    "fileId": cloudSession.getCurrentSeed(),
                    "filename": cloudSession.getCurrentFilename(),
                    "thumbnail": thumbnail,
                    "version": version
                })],
                    { type: "application/json" }));

                // 3. Send request and process response
                fetch(CLOUD_BASE + "/upload" + "?isQuickSave=" + cloudSession.getIsQuickSave(), { method: "POST", headers, body: formData, mode: "cors", credentials: "include" })
                    .then(function (response) {
                        response.json().then(function (uploadedMap) {
                            if (response.status !== 201) {
                                console.log(uploadedMap.message);
                                if (cloudSession.getLastSuccessFilename()) cloudSession.setNewFilename(cloudSession.getLastSuccessFilename());
                                console.timeEnd("saveToCloud");
                                alertMessage.innerHTML = uploadedMap.message;
                                $("#alert").dialog({
                                    title: "Denied", resizable: false, width: "27em",
                                    position: { my: "center", at: "center", of: "svg" },
                                    buttons: { Close: function () { $(this).dialog("close"); } }
                                });
                            } else {
                                cloudSession.setNewFilename(uploadedMap.filename);
                                cloudSession.setLastSuccessFilename();
                                console.timeEnd("saveToCloud");
                                alertMessage.innerHTML = `${cloudSession.getCurrentFilename()}.map is saved to cloud successfully. </br>
                                          You have ${uploadedMap.freeSlots} more memory slots. </br>
                                          <span class="span-link" onclick='copyShareLink("${uploadedMap.shareLink}")'>Copy share link</span>`;
                                $("#alert").dialog({
                                    title: "Success", resizable: false, width: "27em",
                                    position: { my: "center", at: "center", of: "svg" },
                                    buttons: { Close: function () { $(this).dialog("close"); showCloudMenu(); } }
                                });
                            }
                        })
                            .catch(function (err) { console.log(err); console.timeEnd("saveToCloud"); });
                    });
            }
        });
    }
}

// Rename filename of the .map
function renameCloudMap(cloudMap, newFilename) {
    const mapLink = cloudMap.links[0].href;
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

    fetch(mapLink, { method: "PUT", headers, body: JSON.stringify(updatedCloudMap), mode: "cors", credentials: "include" })
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
    if (customization) { tip("Map cannot be saved when edit mode is active, please exit the mode and retry", false, "error"); return; }
    const pattern = /^[-_A-Za-z0-9 ]+$/;
    let placeholder;
    if (!cloudMap) placeholder = !cloudSession.getCurrentFilename() || cloudSession.getCurrentSeed() !== seed ? mapName.value : cloudSession.getCurrentFilename();
    else placeholder = cloudMap.filename;
    alertMessage.innerHTML = `Enter a name for your .map file: <input id="cloudMapName" type="text" style="width:24em" placeholder="${placeholder}" />`;
    $("#alert").dialog({
        resizable: false, title: "Provide a name for a map", width: "27em",
        buttons: {
            Save: function () {
                const newFilename = cloudMapName.value;
                if (newFilename.length === 0) {
                    tip("Please provide a name for a map", false, "error");
                    return;
                } else if (!pattern.test(newFilename)) {
                    tip("Name of the map can consist only of -, _, A-Z, a-z, 0-9, and spaces", false, "error");
                    return;
                }
                if (!cloudMap) { checkRewriting(newFilename); }
                else renameCloudMap(cloudMap, newFilename);
            },
            Reset: function () {
                cloudMapName.value = "";
            },
            Cancel: function () { $(this).dialog("close"); }
        }
    });
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
    $("#alert").dialog({
        title: "Delete map", resizable: false, width: "27em",
        position: { my: "center", at: "center", of: "svg" },
        buttons: {
            Yes: function () {
                fetch(deleteLink, { method: "DELETE", headers, mode: "cors", credentials: "include" })
                    .then(function (response) {
                        if (!response.ok) {
                            response.json().then(function (data) {
                                console.log(data.message);
                                alertMessage.innerHTML = "Something get wrong while deleting a map. Please try again later!";
                                $("#alert").dialog({
                                    title: "Error", resizable: false, width: "27em",
                                    position: { my: "center", at: "center", of: "svg" },
                                    buttons: {
                                        Close: function () { $(this).dialog("close"); }
                                    }
                                });
                            });
                        } else {
                            alertMessage.innerHTML = `${cloudMap.filename} deleted from the cloud successfully`;
                            $("#alert").dialog({
                                title: "Success", resizable: false, width: "27em",
                                position: { my: "center", at: "center", of: "svg" },
                                buttons: {
                                    Ok: function () { $(this).dialog("close"); showCloudMenu(); }
                                }
                            });
                        }
                    });
            },
            No: function () { $(this).dialog("close"); }
        }
    });
}

// Logout
function logout() {
    const headers = new Headers({ "X-XSRF-TOKEN": cloudSession.getCsrfToken() });
    if (JSON.parse(localStorage.getItem("fmgUser")) !== null) localStorage.removeItem("fmgUser");
    fetch(CLOUD_BASE + "/logout", { method: "POST", headers, mode: "cors", credentials: "include" })
        .then(function (response) {
            if (response.ok || response.status === 401) {
                $("#cloudMenu").dialog("close");
            } else {
                response.json().then(function (data) {
                    console.log(data.message);
                    alertMessage.innerHTML = "Something went wrong while logout. Please try again later!";
                    $("#alert").dialog({
                        title: "Error", resizable: false, width: "27em",
                        position: { my: "center", at: "center", of: "svg" },
                        buttons: {
                            Close: function () { $(this).dialog("close"); }
                        }
                    });
                });
            }
        })
        .catch(function (err) { console.log(err); });
}