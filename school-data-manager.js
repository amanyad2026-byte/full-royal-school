let databashHandle = null;

let schoolData = {
    students: [],
    teachers: [],
    fees: [],
    marksheets: [],
    exams: [],
    subjects: [],
    registeredFaces: [],
    biometricAuditLogs: []
};

if (window.initialSchoolData && typeof window.initialSchoolData === 'object') {
    const init = window.initialSchoolData;
    schoolData = {
        students: Array.isArray(init.students) ? init.students : [],
        teachers: Array.isArray(init.teachers) ? init.teachers : [],
        fees: Array.isArray(init.fees) ? init.fees : [],
        marksheets: Array.isArray(init.marksheets) ? init.marksheets : [],
        exams: Array.isArray(init.exams) ? init.exams : [],
        subjects: Array.isArray(init.subjects) ? init.subjects : [],
        registeredFaces: Array.isArray(init.registeredFaces) ? init.registeredFaces : [],
        biometricAuditLogs: Array.isArray(init.biometricAuditLogs) ? init.biometricAuditLogs : []
    };
}

async function openFileHandleDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('RoyalSchoolFileHandles', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('handles')) {
                db.createObjectStore('handles');
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function saveHandleToDB(key, handle) {
    const db = await openFileHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    const store = tx.objectStore('handles');
    store.put(handle, key);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getHandleFromDB(key) {
    const db = await openFileHandleDB();
    const tx = db.transaction('handles', 'readonly');
    const store = tx.objectStore('handles');
    const request = store.get(key);
    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function verifyHandlePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function' || typeof handle.requestPermission !== 'function') return true;
    const options = { mode: 'readwrite' };
    let permission = await handle.queryPermission(options);
    if (permission === 'granted') return true;
    permission = await handle.requestPermission(options);
    return permission === 'granted';
}

let databashFallbackLoaded = false;

async function restoreDatabashHandle() {
    try {
        const savedHandle = await getHandleFromDB('databashDataFile');
        if (savedHandle && await verifyHandlePermission(savedHandle)) {
            databashHandle = savedHandle;
            await loadFromDatabashFile();
            await updateDatabashStatus();
            return;
        }
    } catch (err) {
        console.warn('Unable to restore databash handle:', err);
    }
    await loadDatabashJsonFallback();
    await updateDatabashStatus();
}

async function loadDatabashJsonFallback() {
    try {
        const response = await fetch('databash.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('databash.json not found');
        const parsed = await response.json();
        schoolData = {
            students: Array.isArray(parsed.students) ? parsed.students : [],
            teachers: Array.isArray(parsed.teachers) ? parsed.teachers : [],
            fees: Array.isArray(parsed.fees) ? parsed.fees : [],
            marksheets: Array.isArray(parsed.marksheets) ? parsed.marksheets : [],
            exams: Array.isArray(parsed.exams) ? parsed.exams : [],
            subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
            registeredFaces: Array.isArray(parsed.registeredFaces) ? parsed.registeredFaces : [],
            biometricAuditLogs: Array.isArray(parsed.biometricAuditLogs) ? parsed.biometricAuditLogs : []
        };
        databashFallbackLoaded = true;
    } catch (err) {
        console.warn('Unable to load databash.json fallback:', err);
        databashFallbackLoaded = false;
    }
}

async function loadFromDatabashFile() {
    if (!databashHandle) return;
    try {
        const file = await databashHandle.getFile();
        const content = await file.text();
        const parsed = JSON.parse(content || '{}');
        schoolData = {
            students: Array.isArray(parsed.students) ? parsed.students : [],
            teachers: Array.isArray(parsed.teachers) ? parsed.teachers : [],
            fees: Array.isArray(parsed.fees) ? parsed.fees : [],
            marksheets: Array.isArray(parsed.marksheets) ? parsed.marksheets : [],
            exams: Array.isArray(parsed.exams) ? parsed.exams : [],
            subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
            registeredFaces: Array.isArray(parsed.registeredFaces) ? parsed.registeredFaces : [],
            biometricAuditLogs: Array.isArray(parsed.biometricAuditLogs) ? parsed.biometricAuditLogs : []
        };
    } catch (err) {
        console.warn('Unable to load databash file data:', err);
    }
}

async function updateDatabashStatus() {
    const status = document.getElementById('databashStatusText');
    if (!status) return;
    if (databashHandle && databashHandle.name) {
        status.innerText = `Selected databash file: ${databashHandle.name}`;
    } else if (databashFallbackLoaded) {
        status.innerText = 'Loaded databash.json from folder. Open a data file once to enable file save.';
    } else {
        status.innerText = 'No databash file selected yet. Select one to enable automatic saves.';
    }
}

async function chooseDatabashFile() {
    if (!window.showOpenFilePicker && !window.showSaveFilePicker) {
        alert('Browser does not support direct file access. Use Chrome or Edge.');
        return;
    }
    try {
        if (window.showOpenFilePicker) {
            const handles = await window.showOpenFilePicker({
                multiple: false,
                types: [{ description: 'Data file', accept: { 'application/json': ['.json', '.txt'] } }],
            });
            databashHandle = handles[0];
        } else {
            databashHandle = await window.showSaveFilePicker({
                suggestedName: 'databash.json',
                types: [{ description: 'Data file', accept: { 'application/json': ['.json'] } }],
            });
        }
        await saveHandleToDB('databashDataFile', databashHandle);
        await loadFromDatabashFile();
        await saveToDatabashFile();
        await updateDatabashStatus();
        alert('Databash file selected. Records will now save directly to this file.');
        if (typeof closeDatabashPopup === 'function') {
            closeDatabashPopup();
        }
    } catch (err) {
        console.log(err);
    }
}

async function saveToDatabashFile() {
    if (!databashHandle) return;
    const writable = await databashHandle.createWritable();
    await writable.write(JSON.stringify(schoolData, null, 2));
    await writable.close();
}

async function syncMasterDatabaseState() {
    schoolData.registeredFaces = schoolData.registeredFaces || [];
    schoolData.biometricAuditLogs = schoolData.biometricAuditLogs || [];
    if (databashHandle) {
        await saveToDatabashFile().catch(err => console.warn('Unable to save master database file:', err));
        return;
    }
    console.warn('No databash file selected. Data is loaded from databash.json, but file writing requires selecting a data file once.');
}

let masterAutoSaveInterval = null;

function startAutoSaveMasterDatabase(intervalMs = 15000) {
    if (masterAutoSaveInterval) return;
    masterAutoSaveInterval = setInterval(syncMasterDatabaseState, intervalMs);
}

function stopAutoSaveMasterDatabase() {
    if (!masterAutoSaveInterval) return;
    clearInterval(masterAutoSaveInterval);
    masterAutoSaveInterval = null;
}

function downloadMasterBackup() {
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(schoolData, null, 4));
    let dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `ROYAL_SCHOOL_MASTER_DB_BACKUP_${new Date().toLocaleDateString('en-CA')}.json`);
    dlAnchorElem.click();
}

function uploadDatabaseFile(event) {
    let file = event.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function (e) {
        try {
            let parsed = JSON.parse(e.target.result);
            if (parsed.students && parsed.teachers && parsed.fees) {
                schoolData = parsed;
                syncMasterDatabaseState();
                alert('Master restored smoothly!');
                refreshAllUIRecords();
            }
        } catch (err) {
            alert('Corrupted parsing file context data structure.');
        }
    };
    reader.readAsText(file);
}
