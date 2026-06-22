let chart1, chart2;

// Función para formatear ms a HH:MM:SS
function formatMsToHMS(ms) {
    if (ms === null || isNaN(ms)) return "00:00:00";
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

// Carga los datos desde el archivo data.json de forma asíncrona
async function cargarDatosYInit() {
    try {
        const response = await fetch('data.json');
        const rawData = await response.json();

        if (rawData.length === 0) return;

        // Guardamos los datos globalmente para que los gráficos los accedan
        window.dashboardData = rawData;

        initSelects(rawData);
    } catch (error) {
        console.error("Error cargando el archivo data.json:", error);
    }
}

function initSelects(rawData) {
    const ambientes = [...new Set(rawData.map(d => d.ambiente).filter(Boolean))];
    const clientes = [...new Set(rawData.map(d => d.cliente).filter(Boolean))];
    const meses = [...new Set(rawData.map(d => d.mes).filter(Boolean))].sort();

    const envSel = document.getElementById('envSelect');
    const cliSel = document.getElementById('clientSelect');
    const envSelMes = document.getElementById('envSelectMes');
    const cliSelMes = document.getElementById('clientSelectMes');

    ambientes.forEach(e => { envSel.add(new Option(e, e)); envSelMes.add(new Option(e, e)); });
    clientes.forEach(c => { cliSel.add(new Option(c, c)); cliSelMes.add(new Option(c, c)); });

    if (ambientes.includes('Production')) { envSel.value = 'Production'; envSelMes.value = 'Production'; }
    if (clientes.includes('Avalian')) { cliSel.value = 'Avalian'; cliSelMes.value = 'Avalian'; }
    if (meses.length > 0) document.getElementById('monthSelect').value = meses[meses.length - 1];

    [envSel, cliSel].forEach(el => el.addEventListener('change', updateChartHistorico));
    [document.getElementById('monthSelect'), envSelMes, cliSelMes].forEach(el => el.addEventListener('change', updateChartMensual));

    updateChartHistorico();
    updateChartMensual();
}

// Ahora procesarDatos recibe la lista de descripciones dinámicas como segundo parámetro
function procesarDatos(datosFiltrados, descripcionesBase) {
    const agrupado = {};
    const fechasSet = new Set();

    datosFiltrados.forEach(d => {
        fechasSet.add(d.date);
        const key = d.date + '_' + d.descripcion;
        if (!agrupado[key]) agrupado[key] = [];
        agrupado[key].push(d.tiempo);
    });

    const fechas = [...fechasSet].sort();

    const datasets = descripcionesBase.map((desc, i) => {
        const dataPoints = fechas.map(f => {
            const tiempos = agrupado[f + '_' + desc];
            if (tiempos && tiempos.length > 0) {
                return Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
            }
            return null;
        });

        // Ángulo dorado para mantener colores contrastantes
        const hue = (i * 137.5) % 360;

        return {
            label: desc,
            data: dataPoints,
            borderColor: `hsl(${hue}, 75%, 50%)`,
            backgroundColor: `hsl(${hue}, 75%, 50%, 0.1)`,
            borderWidth: 2,
            tension: 0.1,
            spanGaps: true
        };
    });

    return { labels: fechas, datasets };
}

function generarGrafico(ctxId, chartRef, chartData) {
    if (chartRef) chartRef.destroy();
    const ctx = document.getElementById(ctxId).getContext('2d');
    return new Chart(ctx, {
        type: 'line', data: chartData,
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 15, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        title: function (tooltipItems) {
                            const fullLabel = tooltipItems[0].label || '';
                            const parts = fullLabel.split(' ');
                            return parts.length === 2 ? `Fecha: ${parts[0]} - Hora: ${parts[1]}` : fullLabel;
                        },
                        label: function (context) {
                            let label = context.dataset.label ? context.dataset.label + ': ' : '';
                            if (context.parsed.y !== null) label += formatMsToHMS(context.parsed.y) + ' (' + context.parsed.y + ' ms)';
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Fechas' },
                    ticks: { maxRotation: 45, minRotation: 45, callback: function (value) { return this.getLabelForValue(value)?.split(' ')[0] || ''; } }
                },
                y: { beginAtZero: true, title: { display: true, text: 'Tiempo (HH:MM:SS)' }, ticks: { callback: function (value) { return formatMsToHMS(value); } } }
            }
        }
    });
}

function updateChartHistorico() {
    const rawData = window.dashboardData;
    const env = document.getElementById('envSelect').value;
    const cli = document.getElementById('clientSelect').value;

    // Filtramos los datos por cliente y ambiente
    const datosFiltrados = rawData.filter(d => d.ambiente === env && d.cliente === cli);

    // Obtenemos SOLO las descripciones que existen para este cliente
    const descripcionesDelCliente = [...new Set(datosFiltrados.map(d => d.descripcion))].sort();

    chart1 = generarGrafico('chartHistorico', chart1, procesarDatos(datosFiltrados, descripcionesDelCliente));
}

function updateChartMensual() {
    const rawData = window.dashboardData;
    const env = document.getElementById('envSelectMes').value;
    const cli = document.getElementById('clientSelectMes').value;
    const mes = document.getElementById('monthSelect').value;

    // Para mantener los colores idénticos al histórico, sacamos las descripciones de TODO el cliente
    const datosCliente = rawData.filter(d => d.ambiente === env && d.cliente === cli);
    const descripcionesDelCliente = [...new Set(datosCliente.map(d => d.descripcion))].sort();

    // Pero solo le pasamos a Chart.js los datos del mes seleccionado
    const datosMes = datosCliente.filter(d => d.mes === mes);

    chart2 = generarGrafico('chartMensual', chart2, procesarDatos(datosMes, descripcionesDelCliente));
}

function toggleLineas(chartInstance, mostrar) {
    if (!chartInstance) return;
    chartInstance.data.datasets.forEach((dataset, index) => chartInstance.setDatasetVisibility(index, mostrar));
    chartInstance.update();
}

// Disparamos la carga asíncrona al iniciar
document.addEventListener('DOMContentLoaded', cargarDatosYInit);