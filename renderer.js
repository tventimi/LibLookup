window.addEventListener('DOMContentLoaded', async () => {
    //add event to open browser window when button clicked
    document.getElementById('browserButton').addEventListener('click', () => {
        window.electronApi.sendClickEvent()
    });
    
    //add event to load config file
    document.getElementById('loadConfigButton').addEventListener('click', async () => {
        const filePath = await window.electronApi.selectConfigFile();
        if (filePath) {
            await window.electronApi.loadConfigFile(filePath)
            loadCatalogs()
        } 
    });
    loadCatalogs()
});

async function loadCatalogs() {
    //populate list with catalog names
    const selectElement = document.getElementById('catalogList')
    const catalogs = await window.electronApi.getCatalogList()
    if(!catalogs) {
        document.getElementById('browserButton').disabled = true
        alert("Please load a config file.")
        return
    }
    selectElement.innerHTML = ""
    catalogs.forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      selectElement.appendChild(option);
    });
    document.getElementById('browserButton').disabled = false
}