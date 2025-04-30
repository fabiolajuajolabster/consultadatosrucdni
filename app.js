const express = require("express");
const puppeteer = require("puppeteer-core");

const app = express();
const PORT = process.env.PORT || 9101;
app.set("port", PORT);
app.use(express.json());

// Añadir middleware para CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        return res.status(200).json({});
    }
    next();
});

// Opciones mejoradas para Puppeteer con mayores timeouts
const browserP = puppeteer.launch({
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    headless: true,
    protocolTimeout: 60000, // Aumentar a 60 segundos
    timeout: 60000 // Timeout general
});

app.post("/sunat", (req, res) => {
    let page;
    let body_filtros = req.body;
    console.log(body_filtros);
    (async () => {
        try {
            page = await (await browserP).newPage();
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
                // Intentar obtener datos según el formato de respuesta para RUC
                let razonSocial = "";
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
                        
                        return {
                            razon_social: razonSocial,
                            actividades: elementos[10] ? elementos[10].textContent.trim() : "No encontrado"
                        };
                    } 
                    // Verificar si es respuesta de búsqueda por DNI (lista de resultados)
                    else {
                        // Buscar dentro de los elementos h4 que contengan el nombre
                        let elementosNombre = document.querySelectorAll('h4.list-group-item-heading');
                        if (elementosNombre && elementosNombre.length > 1) {
                            // El segundo h4 dentro del item contiene el nombre completo
                            razonSocial = elementosNombre[1].textContent.trim();
                            
                            return {
                                razon_social: razonSocial,
                                actividades: "No aplica para DNI"
                            };
                        }
                    }
                }
                
                // Si no se pudo extraer de ninguna manera, devolver mensaje genérico
                return {
                    razon_social: "No se pudo extraer el nombre",
                    actividades: "No encontrado"
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
