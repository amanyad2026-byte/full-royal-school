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

const DATABASE_HANDLE_KEY = 'selectedDatabaseFileHandle';
const FILE_HANDLE_DB_NAME = 'RoyalSchoolDatabaseHandles';
const FILE_HANDLE_STORE_NAME = 'handles';
const OFFLINE_DATABASE_PATH_HINT = 'C:\\Users\\School work\\OneDrive\\dta.json';

let selectedDatabaseFileHandle = null;
let databaseFileSaveTimer = null;
let masterAutoSaveInterval = null;

function getDatabashStatusElement() {
    return document.getElementById('databashStatusText');
}

function setDatabashStatus(message) {
    const status = getDatabashStatusElement();
    if (status) {
        status.innerHTML = message;
    }
}

function isValidDatabase(data) {
    return data && typeof data === 'object' &&
        Array.isArray(data.students) && Array.isArray(data.teachers) && Array.isArray(data.fees) &&
        Array.isArray(data.marksheets) && Array.isArray(data.exams) && Array.isArray(data.subjects);
}

async function openDatabaseFileHandleDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FILE_HANDLE_DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(FILE_HANDLE_STORE_NAME)) {
                db.createObjectStore(FILE_HANDLE_STORE_NAME);
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error || new Error('Unable to open IndexedDB.'));
    });
}

async function saveHandleToDB(key, handle) {
    const db = await openDatabaseFileHandleDB();
    const tx = db.transaction(FILE_HANDLE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(FILE_HANDLE_STORE_NAME);
    store.put(handle, key);
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Unable to save file handle.'));
    });
}

async function getHandleFromDB(key) {
    const db = await openDatabaseFileHandleDB();
    const tx = db.transaction(FILE_HANDLE_STORE_NAME, 'readonly');
    const store = tx.objectStore(FILE_HANDLE_STORE_NAME);
    const request = store.get(key);
    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error || new Error('Unable to read file handle.'));
    });
}

async function verifyHandlePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function' || typeof handle.requestPermission !== 'function') {
        return true;
    }

    const options = { mode: 'readwrite' };
    let permission = await handle.queryPermission(options);
    if (permission === 'granted') return true;
    if (permission === 'prompt') {
        permission = await handle.requestPermission(options);
    }
    return permission === 'granted';
}

async function updateDatabashStatus() {
    const status = getDatabashStatusElement();
    if (!status) return;

    if (selectedDatabaseFileHandle && selectedDatabaseFileHandle.name) {
        status.innerHTML = `Auto-save enabled for <strong>${selectedDatabaseFileHandle.name}</strong>. Changes are saved automatically.`;
        return;
    }

    status.innerHTML = `Select a JSON database file for auto-save or upload one manually. Recommended path: <strong>${OFFLINE_DATABASE_PATH_HINT}</strong>`;
}

async function setSelectedDatabaseFileHandle(handle) {
    selectedDatabaseFileHandle = handle;
    if (!handle) return;

    try {
        await saveHandleToDB(DATABASE_HANDLE_KEY, handle);
    } catch (err) {
        console.warn('Unable to save selected database file handle:', err);
    }
}

async function restoreDatabashHandle() {
    try {
        const handle = await getHandleFromDB(DATABASE_HANDLE_KEY);
        if (!handle) {
            selectedDatabaseFileHandle = null;
            await updateDatabashStatus();
            return;
        }

        if (await verifyHandlePermission(handle)) {
            selectedDatabaseFileHandle = handle;
            await loadDatabaseFromSelectedFile();
        } else {
            selectedDatabaseFileHandle = null;
        }
    } catch (err) {
        console.warn('Unable to restore saved file handle:', err);
        selectedDatabaseFileHandle = null;
    }

    await updateDatabashStatus();
}

async function writeDatabaseToSelectedFile() {
    if (!selectedDatabaseFileHandle) return;

    try {
        if (!(await verifyHandlePermission(selectedDatabaseFileHandle))) {
            setDatabashStatus('Permission not granted for the selected file. Re-select the database file.');
            return;
        }

        const writable = await selectedDatabaseFileHandle.createWritable();
        await writable.truncate(0);
        await writable.write(JSON.stringify(schoolData, null, 4));
        await writable.close();

        setDatabashStatus(`Auto-saved to <strong>${selectedDatabaseFileHandle.name}</strong>.`);
    } catch (err) {
        console.warn('Unable to write database to selected file:', err);
        setDatabashStatus('Auto-save failed. Please check browser permissions and file access.');
    }
}

function scheduleDatabaseFileSave() {
    if (!selectedDatabaseFileHandle) return;
    if (databaseFileSaveTimer) {
        clearTimeout(databaseFileSaveTimer);
    }
    databaseFileSaveTimer = setTimeout(async () => {
        databaseFileSaveTimer = null;
        await writeDatabaseToSelectedFile();
    }, 500);
}

async function loadDatabaseFromSelectedFile() {
    if (!selectedDatabaseFileHandle) return;

    try {
        const file = await selectedDatabaseFileHandle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!isValidDatabase(parsed)) {
            throw new Error('Selected file does not contain the expected database structure.');
        }

        schoolData = parsed;
        syncMasterDatabaseState();
        if (typeof refreshAllUIRecords === 'function') refreshAllUIRecords();
        setDatabashStatus(`Loaded <strong>${selectedDatabaseFileHandle.name}</strong> and auto-save is active.`);
    } catch (err) {
        console.warn('Unable to load database from selected file:', err);
        setDatabashStatus('Failed to load selected database file. Upload a valid JSON file or select a different file.');
    }
}

async function selectDatabaseFileForAutoSave() {
    if (!window.showOpenFilePicker) {
        alert('Automatic file save is not supported in this browser. Use the JSON upload option instead.');
        return;
    }

    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'JSON Database File',
                accept: { 'application/json': ['.json'] }
            }],
            excludeAcceptAllOption: true,
            multiple: false
        });
        if (!handle) return;

        if (!(await verifyHandlePermission(handle))) {
            setDatabashStatus('Permission denied for the selected file. Try selecting a file with write access.');
            return;
        }

        await setSelectedDatabaseFileHandle(handle);
        await loadDatabaseFromSelectedFile();
        await updateDatabashStatus();
    } catch (err) {
        console.warn('Database file selection failed:', err);
        if (err && err.name !== 'AbortError') {
            setDatabashStatus('Database file selection failed. Please try again.');
        }
    }
}

function syncMasterDatabaseState() {
    schoolData.registeredFaces = Array.isArray(schoolData.registeredFaces) ? schoolData.registeredFaces : [];
    schoolData.biometricAuditLogs = Array.isArray(schoolData.biometricAuditLogs) ? schoolData.biometricAuditLogs : [];

    if (selectedDatabaseFileHandle) {
        scheduleDatabaseFileSave();
    }
}

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
    const fileName = `ROYAL_SCHOOL_MASTER_DB_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(schoolData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function uploadDatabaseFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!isValidDatabase(parsed)) {
                throw new Error('Invalid database structure.');
            }

            schoolData = parsed;
            selectedDatabaseFileHandle = null;
            syncMasterDatabaseState();
            alert('Master restored smoothly!');
            if (typeof refreshAllUIRecords === 'function') refreshAllUIRecords();
            setDatabashStatus('Local database loaded from uploaded JSON file. Select a file to enable auto-save.');
        } catch (err) {
            console.warn('Upload failed:', err);
            alert('Corrupted or invalid database file. Please upload a valid JSON file.');
            setDatabashStatus('Upload failed. Provide a valid database JSON file.');
        }
    };

    reader.onerror = function (err) {
        console.warn('File read failed:', err);
        alert('Unable to read the uploaded file.');
        setDatabashStatus('Upload failed due to file read error.');
    };

    reader.readAsText(file);
}
