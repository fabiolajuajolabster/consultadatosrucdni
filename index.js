const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.set("port", process.env.PORT || 1000);
app.use(express.json());
app.use(cors());

// Reemplaza la configuración del navegador Puppeteer con esto:
const launchBrowser = async () => {
    return puppeteer.launch({
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--single-process"
        ],
        headless: true,
        protocolTimeout: 60000,
        timeout: 60000
    });
};

// Y actualiza cómo inicializas el navegador:
let browserInstance = null;
const getBrowser = async () => {
    if (!browserInstance) {
        try {
            browserInstance = await launchBrowser();
            
            // Reiniciar el navegador si se cierra inesperadamente
            browserInstance.on('disconnected', () => {
                console.log('Browser disconnected. Restarting...');
                browserInstance = null;
            });
        } catch (err) {
            console.error('Error launching browser:', err);
            browserInstance = null;
            throw err;
        }
    }
    return browserInstance;
};

app.post("/sunat", (req, res) => {
    let page;
    let body_filtros = req.body;
    console.log(body_filtros);
    (async () => {
        try {
            const browser = await getBrowser();
            page = await browser.newPage();
            await page.setDefaultNavigationTimeout(60000); // 60 segundos para navegación
            await page.setDefaultTimeout(60000); // 60 segundos para otras operaciones
            
            await page.setUserAgent('5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36');
            await page.goto('https://e-consultaruc.sunat.gob.pe/cl-ti-itmrconsruc/FrameCriterioBusquedaWeb.jsp');
            
            // Determinar el tipo de documento y flujo a seguir
            if (body_filtros.tipo === 'ruc' || !body_filtros.tipo) {
                // Flujo para RUC (el original)
                await page.waitForSelector("#btnAceptar");  
                await page.type("#txtRuc", body_filtros.documento);
                await page.click("#btnAceptar");
            } else {
                // Flujo para DNI u otros documentos
                await page.waitForSelector("#btnPorDocumento");
                await page.click("#btnPorDocumento");
                
                // Esperar a que aparezca el selector de tipo de documento
                await page.waitForSelector("#cmbTipoDoc");
                
                // Seleccionar el tipo de documento según el valor recibido
                switch(body_filtros.tipo) {
                    case 'dni':
                        await page.select("#cmbTipoDoc", "1"); // DNI
                        break;
                    case 'ce':
                        await page.select("#cmbTipoDoc", "4"); // Carnet de Extranjería
                        break;
                    case 'pasaporte':
                        await page.select("#cmbTipoDoc", "7"); // Pasaporte
                        break;
                    case 'diplomatico':
                        await page.select("#cmbTipoDoc", "A"); // Cédula Diplomática
                        break;
                    default:
                        await page.select("#cmbTipoDoc", "1"); // Por defecto DNI
                }
                
                // Ingresar el número de documento
                await page.type("#txtNumeroDocumento", body_filtros.documento);
                
                // Hacer clic en el botón aceptar
                await page.click("#btnAceptar");
            }
            
            // Esperar a que cargue la información
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            let salida = await page.evaluate(() => {
                // Intentar obtener datos según el formato de respuesta
                let razonSocial = "";
                let domicilioFiscal = "";
                let elementos = document.querySelectorAll('.list-group-item-heading');
                
                if (elementos && elementos.length > 0) {
                    // Verificar si es respuesta de búsqueda por RUC (formato detallado)
                    if (elementos[0] && elementos[0].textContent.includes("Número de RUC")) {
                        // Es búsqueda por RUC - El formato es "XXXXXXXXXX - NOMBRE"
                        let textoCompleto = elementos[1] ? elementos[1].textContent.trim() : "No encontrado";
                        
                        // Extraer solo el nombre (lo que viene después del guion)
                        let partes = textoCompleto.split('-');
                        if (partes.length > 1) {
                            razonSocial = partes[1].trim();
                        } else {
                            razonSocial = textoCompleto;
                        }
                        
                        // Buscar el domicilio fiscal
                        const itemsDomicilio = document.querySelectorAll('.list-group-item');
                        for (let i = 0; i < itemsDomicilio.length; i++) {
                            const heading = itemsDomicilio[i].querySelector('.list-group-item-heading');
                            if (heading && heading.textContent.includes("Domicilio Fiscal")) {
                                const textoItem = itemsDomicilio[i].querySelector('.list-group-item-text');
                                if (textoItem) {
                                    domicilioFiscal = textoItem.textContent.trim();
                                    break;
                                }
                            }
                        }
                        
                        return {
                            razon_social: razonSocial,
                            actividades: elementos[10] ? elementos[10].textContent.trim() : "No encontrado",
                            domicilio_fiscal: domicilioFiscal
                        };
                    } 
                    // Verificar si es respuesta de búsqueda por DNI (lista de resultados)
                    else {
                        // Buscar dentro de los elementos h4 que contengan el nombre
                        let elementosNombre = document.querySelectorAll('h4.list-group-item-heading');
                        if (elementosNombre && elementosNombre.length > 1) {
                            // El segundo h4 dentro del item contiene el nombre completo
                            let nombreCompleto = elementosNombre[1].textContent.trim();
                            
                            // Convertir el nombre a formato de capitalización correcta
                            // (primera letra de cada palabra en mayúscula)
                            nombreCompleto = nombreCompleto.toLowerCase().split(' ').map(palabra => {
                                return palabra.charAt(0).toUpperCase() + palabra.slice(1);
                            }).join(' ');
                            
                            // Reordenar el nombre (suponiendo que sigue el formato "APELLIDOS NOMBRES")
                            const palabras = nombreCompleto.split(' ');
                            if (palabras.length >= 3) {
                                // Asumimos que los 2 primeros son apellidos y el resto nombres
                                // (Esto es una simplificación, la lógica real podría ser más compleja)
                                const apellidos = palabras.slice(0, 2).join(' ');
                                const nombres = palabras.slice(2).join(' ');
                                nombreCompleto = nombres + ' ' + apellidos;
                            }
                            
                            return {
                                razon_social: nombreCompleto,
                                actividades: "No aplica para este tipo de documento",
                                domicilio_fiscal: "No aplica para este tipo de documento"
                            };
                        }
                    }
                }
                
                // Si no se pudo extraer de ninguna manera, devolver mensaje genérico
                return {
                    razon_social: "No se pudo extraer el nombre",
                    actividades: "No encontrado",
                    domicilio_fiscal: "No encontrado"
                };
            });
            res.send(salida);
        } catch (err) {
            console.error("Error detallado:", err);
            res.status(500).send({error: err.message});
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (err) {
                    console.error("Error al cerrar la página:", err);
                }
            }
        }
    })();
});

app.listen(app.get("port"), () =>
    console.log("Servidor en puerto " + app.get("port"))
);
