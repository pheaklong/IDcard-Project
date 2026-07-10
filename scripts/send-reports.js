// scripts/send-reports.js
// Auto Send Reports to Telegram via GitHub Actions

const axios = require('axios');
const XLSX = require('xlsx');

// ============================================
// CONFIGURATION - ប្តូរតម្លៃទាំងនេះតាមតម្រូវការ
// ============================================

// យកតម្លៃពី Environment Variables (សុវត្ថិភាពជាង)
// ប្រសិនបើគ្មាន ប្រើតម្លៃដើម
const BOT_TOKEN = process.env.BOT_TOKEN || '7947542376:AAHkKJ-OQNbrI8iArU5h0RgRwzowzTbvlxA';
const CHAT_ID = process.env.CHAT_ID || '-1002390198977';

// Supabase Configuration
const SUPABASE_URL = 'https://ovvlshbuayykddqrnoqx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92dmxzaGJ1YXl5a2RkcXJub3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NjQxODgsImV4cCI6MjA3NjM0MDE4OH0.vWLDFMS16PwZga9mYehVUiL6G0ccnRzdc9OUf2OM76I';

// ============================================
// LOGGING FUNCTIONS
// ============================================

function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const emoji = type === 'ERROR' ? '❌' : type === 'SUCCESS' ? '✅' : type === 'WARNING' ? '⚠️' : '📊';
    console.log(`${emoji} [${timestamp}] ${type}: ${message}`);
}

// ============================================
// DATA FETCHING FUNCTIONS
// ============================================

/**
 * ទាញយកទិន្នន័យទាំងអស់ពីតារាងក្នុង Supabase
 * @param {string} tableName - ឈ្មោះតារាង
 * @returns {Promise<Array>} - ទិន្នន័យទាំងអស់
 */
async function fetchAllData(tableName) {
    try {
        log(`Fetching data from ${tableName}...`, 'INFO');
        let allData = [];
        let start = 0;
        const batchSize = 1000;
        let hasMore = true;
        let batchCount = 0;

        while (hasMore) {
            batchCount++;
            const url = `${SUPABASE_URL}/rest/v1/${tableName}?select=*&offset=${start}&limit=${batchSize}`;
            
            const response = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data && data.length > 0) {
                allData = allData.concat(data);
                start += batchSize;
                log(`Batch ${batchCount}: Loaded ${data.length} records (Total: ${allData.length})`, 'INFO');
                
                if (data.length < batchSize) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        log(`✅ Successfully loaded ${allData.length} records from ${tableName}`, 'SUCCESS');
        return allData;
    } catch (error) {
        log(`Error fetching from ${tableName}: ${error.message}`, 'ERROR');
        return [];
    }
}

// ============================================
// TELEGRAM SEND FUNCTIONS
// ============================================

/**
 * ផ្ញើសារទៅ Telegram
 * @param {string} text - អត្ថបទដែលចង់ផ្ញើ
 * @param {Buffer} fileBuffer - ឯកសារភ្ជាប់ (ស្រេចចិត្ត)
 * @param {string} fileName - ឈ្មោះឯកសារ
 * @returns {Promise<boolean>} - ជោគជ័យ/បរាជ័យ
 */
async function sendToTelegram(text, fileBuffer = null, fileName = null) {
    try {
        // 1. ផ្ញើអត្ថបទ
        log(`Sending text message to Telegram...`, 'INFO');
        const textUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        
        const textResponse = await axios.post(textUrl, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        if (textResponse.status !== 200) {
            throw new Error(`Text send failed: ${textResponse.status}`);
        }
        log(`✅ Text message sent successfully`, 'SUCCESS');

        // 2. ផ្ញើឯកសារ (ប្រសិនបើមាន)
        if (fileBuffer && fileName) {
            log(`Sending file: ${fileName}...`, 'INFO');
            
            const formData = new FormData();
            formData.append('chat_id', CHAT_ID);
            formData.append('document', new Blob([fileBuffer]), fileName);
            
            const fileUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
            const fileResponse = await axios.post(fileUrl, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (fileResponse.status !== 200) {
                throw new Error(`File send failed: ${fileResponse.status}`);
            }
            log(`✅ File ${fileName} sent successfully`, 'SUCCESS');
        }

        return true;
    } catch (error) {
        log(`Error sending to Telegram: ${error.message}`, 'ERROR');
        if (error.response) {
            log(`Response data: ${JSON.stringify(error.response.data)}`, 'ERROR');
        }
        return false;
    }
}

// ============================================
// EXCEL CREATION FUNCTIONS
// ============================================

/**
 * បង្កើតឯកសារ Excel ពីទិន្នន័យ
 * @param {Array} data - ទិន្នន័យសម្រាប់បង្កើត Excel
 * @param {string} sheetName - ឈ្មោះ Sheet
 * @returns {Buffer|null} - Buffer នៃឯកសារ Excel
 */
function createExcelBuffer(data, sheetName = 'ទិន្នន័យ') {
    try {
        if (!data || data.length === 0) {
            log('No data to create Excel', 'WARNING');
            return null;
        }

        const ws = XLSX.utils.json_to_sheet(data);
        
        // កំណត់ទទឹងជួរឈរដោយស្វ័យប្រវត្តិ
        const colWidths = Object.keys(data[0]).map(key => ({
            wch: Math.max(key.length * 2, 15)
        }));
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        const buffer = XLSX.write(wb, { 
            bookType: 'xlsx', 
            type: 'buffer',
            bookSST: false
        });
        
        log(`✅ Excel file created: ${data.length} rows, sheet: ${sheetName}`, 'SUCCESS');
        return buffer;
    } catch (error) {
        log(`Error creating Excel: ${error.message}`, 'ERROR');
        return null;
    }
}

// ============================================
// REPORT SEND FUNCTIONS
// ============================================

/**
 * ផ្ញើរបាយការណ៍ទិន្នន័យយឺតប្រចាំថ្ងៃ
 */
async function sendLateReport() {
    try {
        log('📊 Sending late report...', 'INFO');
        const data = await fetchAllData('attendance_reports');
        
        if (!data || data.length === 0) {
            log('No late reports found', 'WARNING');
            return false;
        }

        const today = new Date().toISOString().split('T')[0];
        const todayData = data.filter(r => r.date === today);
        
        if (todayData.length === 0) {
            log('No late reports for today', 'WARNING');
            return false;
        }

        const excelData = todayData.map((report, index) => {
            const displayDate = new Date(report.date).toLocaleDateString('km-KH', {
                year: 'numeric', 
                month: 'long', 
                day: 'numeric'
            });
            return {
                'ល.រ': index + 1,
                'ឈ្មោះសិស្ស': report.name || 'N/A',
                'លេខសម្គាល់': report.student_id || 'N/A',
                'ថ្នាក់': report.class || 'N/A',
                'ភេទ': report.gender || 'មិនមាន',
                'បញ្ហា': 'ទិន្នន័យយឺត',
                'ពេលវេលា': report.scan_time || report.late_time || 'N/A',
                'កាលបរិច្ឆេទ': displayDate
            };
        });

        const buffer = createExcelBuffer(excelData, 'ទិន្នន័យយឺត');
        if (!buffer) return false;

        const todayStr = new Date().toLocaleDateString('km-KH', {
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        });
        
        const textMsg = `📊 <b>របាយការណ៍ទិន្នន័យយឺត</b>\n` +
                       `📅 កាលបរិច្ឆេទ: ${todayStr}\n` +
                       `👥 ចំនួនទិន្នន័យ: ${todayData.length}\n\n` +
                       `📎 ឯកសារភ្ជាប់: Excel`;

        const result = await sendToTelegram(textMsg, buffer, `ទិន្នន័យ_យឺត_${today}.xlsx`);
        
        if (result) {
            log('✅ Late report sent successfully', 'SUCCESS');
        }
        return result;
    } catch (error) {
        log(`Error sending late report: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * ផ្ញើរបាយការណ៍ទិន្នន័យវិន័យប្រចាំថ្ងៃ
 */
async function sendDisciplineReport() {
    try {
        log('📊 Sending discipline report...', 'INFO');
        const data = await fetchAllData('discipline_reports');
        
        if (!data || data.length === 0) {
            log('No discipline reports found', 'WARNING');
            return false;
        }

        const today = new Date().toISOString().split('T')[0];
        const todayData = data.filter(r => r.date === today);
        
        if (todayData.length === 0) {
            log('No discipline reports for today', 'WARNING');
            return false;
        }

        const excelData = todayData.map((report, index) => {
            const displayDate = new Date(report.date).toLocaleDateString('km-KH', {
                year: 'numeric', 
                month: 'long', 
                day: 'numeric'
            });
            return {
                'ល.រ': index + 1,
                'ឈ្មោះសិស្ស': report.name || 'N/A',
                'លេខសម្គាល់': report.student_id || 'N/A',
                'ថ្នាក់': report.class || 'N/A',
                'ភេទ': report.gender || 'មិនមាន',
                'បញ្ហា': report.discipline_description || 'គ្មានការពិពណ៌នា',
                'ពេលវេលា': report.scan_time || 'N/A',
                'កាលបរិច្ឆេទ': displayDate
            };
        });

        const buffer = createExcelBuffer(excelData, 'ទិន្នន័យវិន័យ');
        if (!buffer) return false;

        const todayStr = new Date().toLocaleDateString('km-KH', {
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        });
        
        const textMsg = `📊 <b>របាយការណ៍ទិន្នន័យវិន័យ</b>\n` +
                       `📅 កាលបរិច្ឆេទ: ${todayStr}\n` +
                       `👥 ចំនួនទិន្នន័យ: ${todayData.length}\n\n` +
                       `📎 ឯកសារភ្ជាប់: Excel`;

        const result = await sendToTelegram(textMsg, buffer, `ទិន្នន័យ_វិន័យ_${today}.xlsx`);
        
        if (result) {
            log('✅ Discipline report sent successfully', 'SUCCESS');
        }
        return result;
    } catch (error) {
        log(`Error sending discipline report: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * ផ្ញើរបាយការណ៍សង្ខេបទិន្នន័យយឺតប្រចាំខែ
 */
async function sendLateSummary() {
    try {
        log('📊 Sending late summary...', 'INFO');
        const data = await fetchAllData('attendance_reports');
        
        if (!data || data.length === 0) {
            log('No data found for late summary', 'WARNING');
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
            log('No data for last month', 'WARNING');
            return false;
        }

        // គណនាចំនួនយឺតតាមសិស្ស
        const counts = {};
        const details = {};
        const lastDate = {};
        
        filtered.forEach(r => {
            const id = r.student_id;
            if (!counts[id]) {
                counts[id] = 0;
                details[id] = {
                    name: r.name || 'N/A',
                    class: r.class || 'N/A',
                    gender: r.gender || 'មិនមាន'
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
                'ឈ្មោះសិស្ស': details[id].name,
                'លេខសម្គាល់': id,
                'ថ្នាក់': details[id].class,
                'ភេទ': details[id].gender,
                'ចំនួនយឺត': counts[id],
                'កាលបរិច្ឆេទយឺតចុងក្រោយ': lastDate[id].toLocaleDateString('km-KH', {
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric'
                })
            }))
            .sort((a, b) => b['ចំនួនយឺត'] - a['ចំនួនយឺត']);

        const buffer = createExcelBuffer(summaryData, 'សង្ខេបយឺត');
        if (!buffer) return false;

        const totalLate = summaryData.reduce((sum, s) => sum + s['ចំនួនយឺត'], 0);
        const monthStr = startDate.toLocaleDateString('km-KH', { 
            month: 'long', 
            year: 'numeric' 
        });
        
        const textMsg = `📊 <b>របាយការណ៍សង្ខេបទិន្នន័យយឺត</b>\n` +
                       `📅 ខែ: ${monthStr}\n` +
                       `👥 ចំនួនសិស្សយឺត: ${summaryData.length}\n` +
                       `⏱️ ចំនួនយឺតសរុប: ${totalLate}\n\n` +
                       `📎 ឯកសារភ្ជាប់: Excel`;

        const result = await sendToTelegram(textMsg, buffer, `សង្ខេប_យឺត_${now.getMonth()+1}_${now.getFullYear()}.xlsx`);
        
        if (result) {
            log('✅ Late summary sent successfully', 'SUCCESS');
        }
        return result;
    } catch (error) {
        log(`Error sending late summary: ${error.message}`, 'ERROR');
        return false;
    }
}

/**
 * ផ្ញើរបាយការណ៍សង្ខេបទិន្នន័យវិន័យប្រចាំខែ
 */
async function sendDisciplineSummary() {
    try {
        log('📊 Sending discipline summary...', 'INFO');
        const data = await fetchAllData('discipline_reports');
        
        if (!data || data.length === 0) {
            log('No data found for discipline summary', 'WARNING');
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
            log('No data for last month', 'WARNING');
            return false;
        }

        // គណនាចំនួនវិន័យតាមសិស្ស
        const counts = {};
        const details = {};
        const problems = {};
        const lastDate = {};
        
        filtered.forEach(r => {
            const id = r.student_id;
            if (!counts[id]) {
                counts[id] = 0;
                details[id] = {
                    name: r.name || 'N/A',
                    class: r.class || 'N/A',
                    gender: r.gender || 'មិនមាន'
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
                    'ឈ្មោះសិស្ស': details[id].name,
                    'លេខសម្គាល់': id,
                    'ថ្នាក់': details[id].class,
                    'ភេទ': details[id].gender,
                    'ចំនួនវិន័យ': counts[id],
                    'បញ្ហាចម្បង': mainProblem,
                    'កាលបរិច្ឆេទវិន័យចុងក្រោយ': lastDate[id].toLocaleDateString('km-KH', {
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric'
                    })
                };
            })
            .sort((a, b) => b['ចំនួនវិន័យ'] - a['ចំនួនវិន័យ']);

        const buffer = createExcelBuffer(summaryData, 'សង្ខេបវិន័យ');
        if (!buffer) return false;

        const totalDisc = summaryData.reduce((sum, s) => sum + s['ចំនួនវិន័យ'], 0);
        const monthStr = startDate.toLocaleDateString('km-KH', { 
            month: 'long', 
            year: 'numeric' 
        });
        
        const textMsg = `📊 <b>របាយការណ៍សង្ខេបទិន្នន័យវិន័យ</b>\n` +
                       `📅 ខែ: ${monthStr}\n` +
                       `👥 ចំនួនសិស្សវិន័យ: ${summaryData.length}\n` +
                       `⚠️ ចំនួនវិន័យសរុប: ${totalDisc}\n\n` +
                       `📎 ឯកសារភ្ជាប់: Excel`;

        const result = await sendToTelegram(textMsg, buffer, `សង្ខេប_វិន័យ_${now.getMonth()+1}_${now.getFullYear()}.xlsx`);
        
        if (result) {
            log('✅ Discipline summary sent successfully', 'SUCCESS');
        }
        return result;
    } catch (error) {
        log(`Error sending discipline summary: ${error.message}`, 'ERROR');
        return false;
    }
}

// ============================================
// MAIN EXECUTION
// ============================================

/**
 * មុខងារសំខាន់ - កំណត់ប្រភេទរបាយការណ៍ដែលត្រូវផ្ញើ
 */
async function main() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const time = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
    const day = now.getDate();
    const reportType = process.env.REPORT_TYPE || 'all';

    log(`🕐 Running at ${time} UTC, day ${day}`, 'INFO');
    log(`📋 Report type: ${reportType}`, 'INFO');
    
    // ពិនិត្យមើលការកំណត់
    if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN') {
        log('⚠️ BOT_TOKEN not configured! Please set BOT_TOKEN in environment variables.', 'WARNING');
    }
    if (!CHAT_ID || CHAT_ID === 'YOUR_CHAT_ID') {
        log('⚠️ CHAT_ID not configured! Please set CHAT_ID in environment variables.', 'WARNING');
    }

    const results = [];
    const startTime = Date.now();

    // ផ្ញើរបាយការណ៍តាមប្រភេទដែលបានជ្រើសរើស
    if (reportType === 'all' || reportType === 'late') {
        results.push(await sendLateReport());
    }
    
    if (reportType === 'all' || reportType === 'discipline') {
        results.push(await sendDisciplineReport());
    }
    
    // របាយការណ៍សង្ខេបប្រចាំខែ (ផ្ញើតែថ្ងៃទី 1 នៃខែ)
    if (day === 1) {
        if (reportType === 'all' || reportType === 'summary') {
            results.push(await sendLateSummary());
        }
        if (reportType === 'all' || reportType === 'discipline-summary') {
            results.push(await sendDisciplineSummary());
        }
    } else {
        log('📌 Skipping monthly summaries (not the 1st of the month)', 'INFO');
    }

    // សង្ខេបលទ្ធផល
    const successCount = results.filter(r => r === true).length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log(`✅ Completed: ${successCount}/${results.length} reports sent successfully in ${elapsed}s`, 'SUCCESS');
    
    // ប្រសិនបើគ្មានរបាយការណ៍ណាមួយត្រូវបានផ្ញើ ចាត់ទុកថាបរាជ័យ
    if (results.length === 0) {
        log('⚠️ No reports were sent. Please check the configuration.', 'WARNING');
        process.exit(1);
    }

    // ប្រសិនបើមានរបាយការណ៍ណាមួយបរាជ័យ
    if (successCount < results.length) {
        log(`⚠️ Some reports failed: ${successCount}/${results.length} succeeded`, 'WARNING');
        process.exit(1);
    }

    process.exit(0);
}

// ============================================
// EXECUTE
// ============================================

// ចាប់ផ្ដើមដំណើរការ
main().catch(error => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    console.error(error.stack);
    process.exit(1);
});
