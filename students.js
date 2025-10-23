var students = [
  //student class 11 A
  {
    "id": "5323",
    "name": "ខុម ស្រីដា",
    "gender": "ស្រី",
    "dob": "2009-08-02",
    "class": "11A",
    "address": "ស្រុក កំរៀង",
    "photo": "001.jpg",
    "phone": "N/A",
    "father": "….",
    "mother": "….",
    "studyYear": "2026",
    "qr_code": "https://pheaklong.github.io/IDcard-Project/digital-card.html?id=5323"
  },
  {
    "id": "5324",
    "name": "គង់ ស៊ីវនីត",
    "gender": "ស្រី",
    "dob": "2006-11-12",
    "class": "11A",
    "address": "ស្រុក កំរៀង",
    "photo": "001.jpg",
    "phone": "N/A",
    "father": "….",
    "mother": "….",
    "studyYear": "2026",
    "qr_code": "https://pheaklong.github.io/IDcard-Project/digital-card.html?id=5324"
  },
  {
    "id": "5325",
    "name": "ឃីម រ៉ានុន",
    "gender": "ប្រុស",
    "dob": "2008-10-25",
    "class": "11A",
    "address": "ស្រុក កំរៀង",
    "photo": "001.jpg",
    "phone": "N/A",
    "father": "….",
    "mother": "….",
    "studyYear": "2026",
    "qr_code": "https://pheaklong.github.io/IDcard-Project/digital-card.html?id=5325"
  },
  {
    "id": "5326",
    "name": "ងិន ស្រីដឿន",
    "gender": "ស្រី",
    "dob": "2008-04-14",
    "class": "11A",
    "address": "ស្រុក កំរៀង",
    "photo": "001.jpg",
    "phone": "N/A",
    "father": "….",
    "mother": "….",
    "studyYear": "2026",
    "qr_code": "https://pheaklong.github.io/IDcard-Project/digital-card.html?id=5326"
  },
  {
    "id": "5327",
    "name": "ងេន សម័យសុធា",
    "gender": "ប្រុស",
    "dob": "2008-06-27",
    "class": "11A",
    "address": "ស្រុក កំរៀង",
    "photo": "001.jpg",
    "phone": "N/A",
    "father": "….",
    "mother": "….",
    "studyYear": "2026",
    "qr_code": "https://pheaklong.github.io/IDcard-Project/digital-card.html?id=5327"
  },
  {
    "id": "5328",
    "name": "ចាន់ ផាន់សា",
    "gender": "ស្រី",
    "dob": "2007-06-03",
    "class": "11A",
    "address": "ស្រុក កំរៀង",
    "photo": "001.jpg",
    "phone": "N/A",
    "father": "….",
    "mother": "….",
    "studyYear": "2026",
    "qr_code": "https://pheaklong.github.io/IDcard-Project/digital-card.html?id=5328"
  },
  {
    "id": "5329",
    "name": "ចិន សៅពេជ",
    "gender": "ស្រី",
    "dob": "2006-03-06",
    "class": "11A",
    "address": "ស្រុក កំរៀង",
    "photo": "001.jpg",
    "phone": "N/A",
    "father": "….",
    "mother": "….",
    "studyYear": "2026",
    "qr_code": "https://pheaklong.github.io/IDcard-Project/digital-card.html?id=5329"
  },
   
];

// Attendance data storage
let attendanceData = JSON.parse(localStorage.getItem('attendanceData')) || {};

// Function to get student by ID
function getStudentById(studentId) {
    return students.find(student => student.id === studentId);
}

// Function to mark attendance
function markAttendance(studentId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    if (!attendanceData[today]) {
        attendanceData[today] = [];
    }
    
    const student = getStudentById(studentId);
    if (student && !attendanceData[today].some(record => record.id === studentId)) {
        const timestamp = new Date().toLocaleTimeString('km-KH');
        attendanceData[today].push({
            id: studentId,
            name: student.name,
            class: student.class,
            time: timestamp
        });
        
        // Save to localStorage
        localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
        return true;
    }
    return false;
}

// Function to get attendance by date
function getAttendanceByDate(date) {
    return attendanceData[date] || [];
}

// Function to get all attendance dates
function getAttendanceDates() {
    return Object.keys(attendanceData).sort().reverse();
}
