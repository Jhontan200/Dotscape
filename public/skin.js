document.getElementById('custom-skin-input').addEventListener('change', function () {
    var fileName = this.files[0] ? this.files[0].name : "Ningún archivo seleccionado";
    if (fileName.length > 20) fileName = fileName.substring(0, 17) + "...";
    document.getElementById('file-name-display').textContent = fileName;
});