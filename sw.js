// sw.js - Service Worker for Auto Send Reports to Telegram

const CACHE_NAME = 'report-system-v1';
const SUPABASE_URL = 'https://ovvlshbuayykddqrnoqx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92dmxzaGJ1YXl5a2RkcXJub3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NjQxODgsImV4cCI6MjA3NjM0MDE4OH0.vWLDFMS16PwZga9mYehVUiL6G0ccnRzdc9OUf2OM76I';

// Store config and pending tasks
let config = null;
let scheduledTasks = {};
let isProcessing = false;

// ============================================
// SERVICE WORKER INSTALL & ACTIVATE
// ============================================

self.addEventListener('install', function(event) {
    console.log('📦 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('📦 Cache opened');
            return cache.addAll([
                '/',
                '/index.html',
                '/login.html',
                '/scan.html'
            ]);
        })
    );
    // Skip waiting to activate immediately
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.log('✅ Service Worker activated');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Claim clients to control all pages
    return self.clients.claim();
});

// ============================================
// MESSAGE HANDLING
// ============================================

self.addEventListener('message', function(event) {
    const data = event.data;
    console.log('📨 Received message from main page:', data.type);

    switch (data.type) {
        case 'UPDATE_CONFIG':
            config = data.config;
            // Save config to cache for offline use
            saveConfigToCache(config);
            console.log('✅ Config updated in Service Worker');
            // Respond back to client
            event.ports[0].postMessage({ status: 'success', message: 'Config updated' });
            break;

        case 'CHECK_PENDING_TASKS':
            checkAndProcessTasks();
            event.ports[0].postMessage({ status: 'ok', message: 'Checking tasks' });
            break;

        case 'GET_STATUS':
            event.ports[0].postMessage({
                status: 'ok',
                config: config,
                isProcessing: isProcessing,
                tasks: scheduledTasks
            });
            break;

        default:
            console.log('⚠️ Unknown message type:', data.type);
    }
});

// ============================================
// BACKGROUND SYNC / PERIODIC TASKS
// ============================================

// Check for scheduled tasks every minute when service worker is active
let checkInterval = null;

self.addEventListener('activate', function(event) {
    // Start periodic check
    if (checkInterval) {
        clearInterval(checkInterval);
    }
    checkInterval = setInterval(() => {
        checkAndProcessTasks();
    }, 60000); // Check every minute

    // Also load saved config from cache
    loadConfigFromCache().then(savedConfig => {
        if (savedConfig) {
            config = savedConfig;
            console.log('📂 Loaded config from cache');
        }
    });
});

// ============================================
// CONFIG CACHE FUNCTIONS
// ============================================

async function saveConfigToCache(newConfig) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = new Response(JSON.stringify(newConfig), {
            headers: { 'Content-Type': 'application/json' }
        });
        await cache.put('/config.json', response);
        console.log('✅ Config saved to cache');
    } catch (error) {
        console.error('❌ Error saving config to cache:', error);
    }
}

async function loadConfigFromCache() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match('/config.json');
        if (response) {
            const configData = await response.json();
            return configData;
        }
        return null;
    } catch (error) {
        console.error('❌ Error loading config from cache:', error);
        return null;
    }
}

// ============================================
// TASK PROCESSING FUNCTIONS
// ============================================

async function checkAndProcessTasks() {
    // If no config or already processing, skip
    if (!config) {
        console.log('⚠️ No config found, skipping task check');
        return;
    }

    if (isProcessing) {
        console.log('⏳ Already processing tasks, skipping');
        return;
    }

    try {
        isProcessing = true;
        const now = new Date();
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        // Get scheduled times from config
        const lateTime = config.scheduleLate || '08:00';
        const disciplineTime = config.scheduleDiscipline || '08:15';
        const summaryTime = config.scheduleSummary || '08:30';
        const disciplineSummaryTime = config.scheduleDisciplineSummary || '08:45';

        // Check if we have a valid bot token and chat ID
        if (!config.botToken || !config.chatId) {
            console.log('⚠️ Missing bot token or chat ID');
            isProcessing = false;
            return;
        }

        // Check daily reports (late and discipline)
        if (lateTime && currentTime === lateTime && !scheduledTasks['late']) {
            scheduledTasks['late'] = true;
            console.log('⏰ Sending late report...');
            await sendLateReport();
            setTimeout(() => { scheduledTasks['late'] = false; }, 120000);
        }

        if (disciplineTime && currentTime === disciplineTime && !scheduledTasks['discipline']) {
            scheduledTasks['discipline'] = true;
            console.log('⏰ Sending discipline report...');
            await sendDisciplineReport();
            setTimeout(() => { scheduledTasks['discipline'] = false; }, 120000);
        }

        // Check monthly summaries (only on the 1st of each month)
        const currentDay = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        if (summaryTime && currentTime === summaryTime && currentDay === 1) {
            const lastSendKey = `last_summary_send_${currentYear}_${currentMonth}`;
            const lastSend = await getFromCache(lastSendKey);
            
            if (!lastSend && !scheduledTasks['summary']) {
                scheduledTasks['summary'] = true;
                console.log('⏰ Sending late summary report (monthly)...');
                await sendLateSummary();
                await saveToCache(lastSendKey, new Date().toISOString());
                setTimeout(() => { scheduledTasks['summary'] = false; }, 120000);
            }
        }

        if (disciplineSummaryTime && currentTime === disciplineSummaryTime && currentDay === 1) {
            const lastSendKey = `last_discipline_summary_send_${currentYear}_${currentMonth}`;
            const lastSend = await getFromCache(lastSendKey);
            
            if (!lastSend && !scheduledTasks['disciplineSummary']) {
                scheduledTasks['disciplineSummary'] = true;
                console.log('⏰ Sending discipline summary report (monthly)...');
                await sendDisciplineSummary();
                await saveToCache(lastSendKey, new Date().toISOString());
                setTimeout(() => { scheduledTasks['disciplineSummary'] = false; }, 120000);
            }
        }

    } catch (error) {
        console.error('❌ Error in checkAndProcessTasks:', error);
    } finally {
        isProcessing = false;
    }
}

// ============================================
// CACHE HELPERS (for persistent storage)
// ============================================

async function getFromCache(key) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(`/data/${key}`);
        if (response) {
            const data = await response.json();
            return data.value;
        }
        return null;
    } catch (error) {
        console.error('❌ Error getting from cache:', error);
        return null;
    }
}

async function saveToCache(key, value) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const data = { value: value, timestamp: new Date().toISOString() };
        const response = new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
        });
        await cache.put(`/data/${key}`, response);
        console.log(`✅ Saved ${key} to cache`);
    } catch (error) {
        console.error('❌ Error saving to cache:', error);
    }
}

// ============================================
// TELEGRAM SEND FUNCTIONS
// ============================================

async function sendToTelegram(text, fileData, fileName) {
    if (!config || !config.botToken || !config.chatId) {
        console.log('⚠️ Cannot send: missing config');
        return false;
    }

    try {
        // Send text message
        const textUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
        const textResponse = await fetch(textUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: config.chatId,
                text: text,
                parse_mode: 'HTML'
            })
        });

        if (!textResponse.ok) {
            throw new Error(`Text send failed: ${textResponse.status}`);
        }

        // Send file if provided
        if (fileData && fileName) {
            const formData = new FormData();
            formData.append('chat_id', config.chatId);
            formData.append('document', fileData, fileName);

            const fileUrl = `https://api.telegram.org/bot${config.botToken}/sendDocument`;
            const fileResponse = await fetch(fileUrl, {
                method: 'POST',
                body: formData
            });

            if (!fileResponse.ok) {
                throw new Error(`File send failed: ${fileResponse.status}`);
            }
        }

        console.log('✅ Sent to Telegram successfully');
        return true;
    } catch (error) {
        console.error('❌ Error sending to Telegram:', error);
        return false;
    }
}

// ============================================
// DATA FETCHING FUNCTIONS
// ============================================

async function fetchAllData(tableName) {
    try {
        // Try to fetch all data with pagination
        let allData = [];
        let start = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const url = `${SUPABASE_URL}/rest/v1/${tableName}?select=*&offset=${start}&limit=${batchSize}`;
            const response = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.length > 0) {
                allData = allData.concat(data);
                start += batchSize;
                if (data.length < batchSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        return allData;
    } catch (error) {
        console.error(`❌ Error fetching from ${tableName}:`, error);
        return [];
    }
}

function createExcelBlob(data, sheetName) {
    try {
        // Simple CSV export as fallback (since we can't use XLSX in Service Worker)
        if (!data || data.length === 0) return null;
        
        const headers = Object.keys(data[0]);
        let csv = headers.join(',') + '\n';
        
        data.forEach(row => {
            const values = headers.map(header => {
                let value = row[header] || '';
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    value = `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            });
            csv += values.join(',') + '\n';
        });
        
        return new Blob([csv], { type: 'text/csv' });
    } catch (error) {
        console.error('❌ Error creating CSV blob:', error);
        return null;
    }
}

function createPDFBlob(htmlContent) {
    try {
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Khmer OS','Arial',sans-serif; margin:20px; }
                    .header { text-align:center; margin-bottom:20px; }
                    table { width:100%; border-collapse:collapse; }
                    th, td { border:1px solid #ddd; padding:8px; text-align:left; }
                    th { background-color:#f5f5f5; }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `;
        return new Blob([fullHtml], { type: 'text/html' });
    } catch (error) {
        console.error('❌ Error creating PDF blob:', error);
        return null;
    }
}

// ============================================
// REPORT SEND FUNCTIONS
// ============================================

async function sendLateReport() {
    try {
        console.log('📊 Fetching late reports...');
        const data = await fetchAllData('attendance_reports');
        if (!data || data.length === 0) {
            console.log('⚠️ No late reports found');
            return false;
        }

        // Filter only today's data
        const today = new Date().toISOString().split('T')[0];
        const todayData = data.filter(r => r.date === today);
        
        if (todayData.length === 0) {
            console.log('⚠️ No late reports for today');
            return false;
        }

        const reportTitle = 'ទិន្នន័យយឺត';
        const todayStr = new Date().toLocaleDateString('km-KH');
        
        const excelData = todayData.map((report, index) => {
            const displayDate = new Date(report.date).toLocaleDateString('km-KH', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            return {
                'ល.រ': index + 1,
                'ឈ្មោះសិស្ស': report.name || 'N/A',
                'លេខសម្គាល់': report.student_id || 'N/A',
                'ថ្នាក់': report.class || 'N/A',
                'ភេទ': report.gender || 'មិនមានទិន្នន័យ',
                'បញ្ហា/ព័ត៌មាន': 'ទិន្នន័យយឺត',
                'ពេលវេលា': report.scan_time || report.late_time || 'N/A',
                'កាលបរិច្ឆេទ': displayDate
            };
        });

        const excelBlob = createExcelBlob(excelData, reportTitle);
        if (!excelBlob) {
            console.log('⚠️ Could not create Excel file');
            return false;
        }

        const htmlContent = `
            <div class="header">
                <h1>របាយការណ៍${reportTitle}</h1>
                <p>កាលបរិច្ឆេទ: ${todayStr}</p>
                <p>ចំនួនទិន្នន័យ: ${todayData.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>ល.រ</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th>លេខសម្គាល់</th>
                        <th>ថ្នាក់</th>
                        <th>ភេទ</th>
                        <th>បញ្ហា/ព័ត៌មាន</th>
                        <th>ពេលវេលា</th>
                        <th>កាលបរិច្ឆេទ</th>
                    </tr>
                </thead>
                <tbody>
                    ${todayData.map((report, index) => {
                        const displayDate = new Date(report.date).toLocaleDateString('km-KH', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        });
                        return `
                            <tr>
                                <td>${index+1}</td>
                                <td>${report.name || 'N/A'}</td>
                                <td>${report.student_id || 'N/A'}</td>
                                <td>${report.class || 'N/A'}</td>
                                <td>${report.gender || 'មិនមានទិន្នន័យ'}</td>
                                <td>ទិន្នន័យយឺត</td>
                                <td>${report.scan_time || report.late_time || 'N/A'}</td>
                                <td>${displayDate}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        const pdfBlob = createPDFBlob(htmlContent);
        if (!pdfBlob) {
            console.log('⚠️ Could not create PDF file');
            return false;
        }

        const textMsg = `📊 <b>របាយការណ៍${reportTitle}</b>\n📅 កាលបរិច្ឆេទ: ${todayStr}\n👥 ចំនួនទិន្នន័យ: ${todayData.length}\n\n📎 ឯកសារភ្ជាប់: Excel និង PDF`;

        const result1 = await sendToTelegram(textMsg, excelBlob, `${reportTitle}_${today}.csv`);
        if (result1) {
            await sendToTelegram('📎 ឯកសារ PDF', pdfBlob, `${reportTitle}_${today}.html`);
            console.log('✅ Late report sent successfully');
            return true;
        }
        return false;

    } catch (error) {
        console.error('❌ Error sending late report:', error);
        return false;
    }
}

async function sendDisciplineReport() {
    try {
        console.log('📊 Fetching discipline reports...');
        const data = await fetchAllData('discipline_reports');
        if (!data || data.length === 0) {
            console.log('⚠️ No discipline reports found');
            return false;
        }

        const today = new Date().toISOString().split('T')[0];
        const todayData = data.filter(r => r.date === today);
        
        if (todayData.length === 0) {
            console.log('⚠️ No discipline reports for today');
            return false;
        }

        const reportTitle = 'ទិន្នន័យវិន័យ';
        const todayStr = new Date().toLocaleDateString('km-KH');
        
        const excelData = todayData.map((report, index) => {
            const displayDate = new Date(report.date).toLocaleDateString('km-KH', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            return {
                'ល.រ': index + 1,
                'ឈ្មោះសិស្ស': report.name || 'N/A',
                'លេខសម្គាល់': report.student_id || 'N/A',
                'ថ្នាក់': report.class || 'N/A',
                'ភេទ': report.gender || 'មិនមានទិន្នន័យ',
                'បញ្ហា/ព័ត៌មាន': report.discipline_description || 'គ្មានការពិពណ៌នា',
                'ពេលវេលា': report.scan_time || 'N/A',
                'កាលបរិច្ឆេទ': displayDate
            };
        });

        const excelBlob = createExcelBlob(excelData, reportTitle);
        if (!excelBlob) {
            console.log('⚠️ Could not create Excel file');
            return false;
        }

        const htmlContent = `
            <div class="header">
                <h1>របាយការណ៍${reportTitle}</h1>
                <p>កាលបរិច្ឆេទ: ${todayStr}</p>
                <p>ចំនួនទិន្នន័យ: ${todayData.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>ល.រ</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th>លេខសម្គាល់</th>
                        <th>ថ្នាក់</th>
                        <th>ភេទ</th>
                        <th>បញ្ហា/ព័ត៌មាន</th>
                        <th>ពេលវេលា</th>
                        <th>កាលបរិច្ឆេទ</th>
                    </tr>
                </thead>
                <tbody>
                    ${todayData.map((report, index) => {
                        const displayDate = new Date(report.date).toLocaleDateString('km-KH', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        });
                        return `
                            <tr>
                                <td>${index+1}</td>
                                <td>${report.name || 'N/A'}</td>
                                <td>${report.student_id || 'N/A'}</td>
                                <td>${report.class || 'N/A'}</td>
                                <td>${report.gender || 'មិនមានទិន្នន័យ'}</td>
                                <td>${report.discipline_description || 'គ្មានការពិពណ៌នា'}</td>
                                <td>${report.scan_time || 'N/A'}</td>
                                <td>${displayDate}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        const pdfBlob = createPDFBlob(htmlContent);
        if (!pdfBlob) {
            console.log('⚠️ Could not create PDF file');
            return false;
        }

        const textMsg = `📊 <b>របាយការណ៍${reportTitle}</b>\n📅 កាលបរិច្ឆេទ: ${todayStr}\n👥 ចំនួនទិន្នន័យ: ${todayData.length}\n\n📎 ឯកសារភ្ជាប់: Excel និង PDF`;

        const result1 = await sendToTelegram(textMsg, excelBlob, `${reportTitle}_${today}.csv`);
        if (result1) {
            await sendToTelegram('📎 ឯកសារ PDF', pdfBlob, `${reportTitle}_${today}.html`);
            console.log('✅ Discipline report sent successfully');
            return true;
        }
        return false;

    } catch (error) {
        console.error('❌ Error sending discipline report:', error);
        return false;
    }
}

async function sendLateSummary() {
    try {
        console.log('📊 Fetching late summary...');
        const data = await fetchAllData('attendance_reports');
        if (!data || data.length === 0) {
            console.log('⚠️ No data found for late summary');
            return false;
        }

        // Get last month's data
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endDate = new Date(now.getFullYear(), now.getMonth(), 0);

        const filtered = data.filter(r => {
            const rd = new Date(r.date);
            return rd >= startDate && rd <= endDate;
        });

        if (filtered.length === 0) {
            console.log('⚠️ No data for last month');
            return false;
        }

        // Group by student
        const counts = {};
        const lastDate = {};
        const details = {};
        
        filtered.forEach(r => {
            const id = r.student_id;
            if (!counts[id]) {
                counts[id] = 0;
                details[id] = {
                    name: r.name || 'N/A',
                    class: r.class || 'N/A',
                    gender: r.gender || 'មិនមានទិន្នន័យ'
                };
            }
            counts[id]++;
            const rd = new Date(r.date);
            if (!lastDate[id] || rd > lastDate[id]) {
                lastDate[id] = rd;
            }
        });

        const summaryData = Object.keys(counts)
            .map(id => ({
                student_id: id,
                name: details[id].name,
                class: details[id].class,
                gender: details[id].gender,
                late_count: counts[id],
                last_late_date: lastDate[id]
            }))
            .sort((a, b) => b.late_count - a.late_count);

        if (summaryData.length === 0) {
            console.log('⚠️ No summary data');
            return false;
        }

        const todayStr = new Date().toLocaleDateString('km-KH');
        const monthStr = startDate.toLocaleDateString('km-KH', { month: 'long', year: 'numeric' });

        const excelData = summaryData.map((s, i) => {
            const lastDateStr = s.last_late_date.toLocaleDateString('km-KH', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            let status = s.late_count >= 5 ? 'យឺតច្រើនណាស់' : s.late_count >= 3 ? 'យឺតច្រើន' : 'យឺតតិច';
            return {
                'ល.រ': i+1,
                'ឈ្មោះសិស្ស': s.name,
                'លេខសម្គាល់': s.student_id,
                'ថ្នាក់': s.class,
                'ភេទ': s.gender,
                'ចំនួនយឺត': s.late_count,
                'កាលបរិច្ឆេទយឺតចុងក្រោយ': lastDateStr,
                'ស្ថានភាព': status
            };
        });

        const excelBlob = createExcelBlob(excelData, 'សង្ខេបយឺត');
        if (!excelBlob) {
            console.log('⚠️ Could not create Excel file');
            return false;
        }

        const totalLate = summaryData.reduce((sum, s) => sum + s.late_count, 0);
        const avgLate = (totalLate / summaryData.length).toFixed(1);
        const maxLate = Math.max(...summaryData.map(s => s.late_count));

        const htmlContent = `
            <div class="header">
                <h1>របាយការណ៍សង្ខេបទិន្នន័យយឺត</h1>
                <p>ខែ: ${monthStr}</p>
                <p>ចំនួនសិស្សយឺត: ${summaryData.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>ល.រ</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th>លេខសម្គាល់</th>
                        <th>ថ្នាក់</th>
                        <th>ភេទ</th>
                        <th>ចំនួនយឺត</th>
                        <th>កាលបរិច្ឆេទយឺតចុងក្រោយ</th>
                        <th>ស្ថានភាព</th>
                    </tr>
                </thead>
                <tbody>
                    ${summaryData.map((s, i) => {
                        const lastDateStr = s.last_late_date.toLocaleDateString('km-KH', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        });
                        let status = s.late_count >= 5 ? 'យឺតច្រើនណាស់' : s.late_count >= 3 ? 'យឺតច្រើន' : 'យឺតតិច';
                        return `
                            <tr>
                                <td>${i+1}</td>
                                <td>${s.name}</td>
                                <td>${s.student_id}</td>
                                <td>${s.class}</td>
                                <td>${s.gender}</td>
                                <td>${s.late_count}</td>
                                <td>${lastDateStr}</td>
                                <td>${status}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        const pdfBlob = createPDFBlob(htmlContent);
        if (!pdfBlob) {
            console.log('⚠️ Could not create PDF file');
            return false;
        }

        const textMsg = `📊 <b>របាយការណ៍សង្ខេបទិន្នន័យយឺត</b>\n📅 ខែ: ${monthStr}\n👥 ចំនួនសិស្សយឺត: ${summaryData.length}\n⏱️ ចំនួនយឺតសរុប: ${totalLate}\n📈 មធ្យមយឺតតាមសិស្ស: ${avgLate}\n🔝 ចំនួនយឺតខ្ពស់បំផុត: ${maxLate}\n\n📎 ឯកសារភ្ជាប់: Excel និង PDF`;

        const result1 = await sendToTelegram(textMsg, excelBlob, `សង្ខេប_យឺត_${now.getMonth()}.csv`);
        if (result1) {
            await sendToTelegram('📎 ឯកសារ PDF', pdfBlob, `សង្ខេប_យឺត_${now.getMonth()}.html`);
            console.log('✅ Late summary sent successfully');
            return true;
        }
        return false;

    } catch (error) {
        console.error('❌ Error sending late summary:', error);
        return false;
    }
}

async function sendDisciplineSummary() {
    try {
        console.log('📊 Fetching discipline summary...');
        const data = await fetchAllData('discipline_reports');
        if (!data || data.length === 0) {
            console.log('⚠️ No data found for discipline summary');
            return false;
        }

        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endDate = new Date(now.getFullYear(), now.getMonth(), 0);

        const filtered = data.filter(r => {
            const rd = new Date(r.date);
            return rd >= startDate && rd <= endDate;
        });

        if (filtered.length === 0) {
            console.log('⚠️ No data for last month');
            return false;
        }

        const counts = {};
        const lastDate = {};
        const details = {};
        const problems = {};

        filtered.forEach(r => {
            const id = r.student_id;
            if (!counts[id]) {
                counts[id] = 0;
                details[id] = {
                    name: r.name || 'N/A',
                    class: r.class || 'N/A',
                    gender: r.gender || 'មិនមានទិន្នន័យ'
                };
                problems[id] = {};
            }
            counts[id]++;
            const problem = r.discipline_description || 'គ្មានបញ្ហាចម្បង';
            problems[id][problem] = (problems[id][problem] || 0) + 1;
            const rd = new Date(r.date);
            if (!lastDate[id] || rd > lastDate[id]) {
                lastDate[id] = rd;
            }
        });

        const summaryData = Object.keys(counts)
            .map(id => {
                const mainProblem = Object.keys(problems[id]).reduce((a, b) => 
                    problems[id][a] > problems[id][b] ? a : b, 'គ្មានបញ្ហាចម្បង'
                );
                return {
                    student_id: id,
                    name: details[id].name,
                    class: details[id].class,
                    gender: details[id].gender,
                    discipline_count: counts[id],
                    main_problem: mainProblem,
                    last_discipline_date: lastDate[id]
                };
            })
            .sort((a, b) => b.discipline_count - a.discipline_count);

        if (summaryData.length === 0) {
            console.log('⚠️ No summary data');
            return false;
        }

        const todayStr = new Date().toLocaleDateString('km-KH');
        const monthStr = startDate.toLocaleDateString('km-KH', { month: 'long', year: 'numeric' });

        const excelData = summaryData.map((s, i) => {
            const lastDateStr = s.last_discipline_date.toLocaleDateString('km-KH', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            let status = s.discipline_count >= 5 ? 'វិន័យច្រើនណាស់' : s.discipline_count >= 3 ? 'វិន័យច្រើន' : 'វិន័យតិច';
            return {
                'ល.រ': i+1,
                'ឈ្មោះសិស្ស': s.name,
                'លេខសម្គាល់': s.student_id,
                'ថ្នាក់': s.class,
                'ភេទ': s.gender,
                'ចំនួនវិន័យ': s.discipline_count,
                'បញ្ហាចម្បង': s.main_problem,
                'កាលបរិច្ឆេទវិន័យចុងក្រោយ': lastDateStr,
                'ស្ថានភាព': status
            };
        });

        const excelBlob = createExcelBlob(excelData, 'សង្ខេបវិន័យ');
        if (!excelBlob) {
            console.log('⚠️ Could not create Excel file');
            return false;
        }

        const totalDisc = summaryData.reduce((sum, s) => sum + s.discipline_count, 0);
        const avgDisc = (totalDisc / summaryData.length).toFixed(1);
        const maxDisc = Math.max(...summaryData.map(s => s.discipline_count));

        const htmlContent = `
            <div class="header">
                <h1>របាយការណ៍សង្ខេបទិន្នន័យវិន័យ</h1>
                <p>ខែ: ${monthStr}</p>
                <p>ចំនួនសិស្សវិន័យ: ${summaryData.length}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>ល.រ</th>
                        <th>ឈ្មោះសិស្ស</th>
                        <th>លេខសម្គាល់</th>
                        <th>ថ្នាក់</th>
                        <th>ភេទ</th>
                        <th>ចំនួនវិន័យ</th>
                        <th>បញ្ហាចម្បង</th>
                        <th>កាលបរិច្ឆេទវិន័យចុងក្រោយ</th>
                        <th>ស្ថានភាព</th>
                    </tr>
                </thead>
                <tbody>
                    ${summaryData.map((s, i) => {
                        const lastDateStr = s.last_discipline_date.toLocaleDateString('km-KH', {
                            year: 'numeric', month: 'long', day: 'numeric'
                        });
                        let status = s.discipline_count >= 5 ? 'វិន័យច្រើនណាស់' : s.discipline_count >= 3 ? 'វិន័យច្រើន' : 'វិន័យតិច';
                        return `
                            <tr>
                                <td>${i+1}</td>
                                <td>${s.name}</td>
                                <td>${s.student_id}</td>
                                <td>${s.class}</td>
                                <td>${s.gender}</td>
                                <td>${s.discipline_count}</td>
                                <td>${s.main_problem}</td>
                                <td>${lastDateStr}</td>
                                <td>${status}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        const pdfBlob = createPDFBlob(htmlContent);
        if (!pdfBlob) {
            console.log('⚠️ Could not create PDF file');
            return false;
        }

        const textMsg = `📊 <b>របាយការណ៍សង្ខេបទិន្នន័យវិន័យ</b>\n📅 ខែ: ${monthStr}\n👥 ចំនួនសិស្សវិន័យ: ${summaryData.length}\n⚠️ ចំនួនវិន័យសរុប: ${totalDisc}\n📈 មធ្យមវិន័យតាមសិស្ស: ${avgDisc}\n🔝 ចំនួនវិន័យខ្ពស់បំផុត: ${maxDisc}\n\n📎 ឯកសារភ្ជាប់: Excel និង PDF`;

        const result1 = await sendToTelegram(textMsg, excelBlob, `សង្ខេប_វិន័យ_${now.getMonth()}.csv`);
        if (result1) {
            await sendToTelegram('📎 ឯកសារ PDF', pdfBlob, `សង្ខេប_វិន័យ_${now.getMonth()}.html`);
            console.log('✅ Discipline summary sent successfully');
            return true;
        }
        return false;

    } catch (error) {
        console.error('❌ Error sending discipline summary:', error);
        return false;
    }
}
