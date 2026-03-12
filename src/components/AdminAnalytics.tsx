import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Printer, Calendar, Database, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { collection, onSnapshot, addDoc, Timestamp, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { useReactToPrint } from 'react-to-print';
import { jsPDF } from 'jspdf';
import PrintReport from './PrintReport';

const COLORS = ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'];

const AdminAnalytics = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const printRef = useRef(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Library_Visitor_Report',
  });

  const handleDownload = () => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(20);
      doc.text("NEU LIBRARY", 105, 20, { align: "center" });
      
      doc.setFontSize(24);
      doc.text("Library Visitor Report", 105, 30, { align: "center" });
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("REPORTING PERIOD", 105, 40, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`${startDate || 'Start'} - ${endDate || 'End'}`, 105, 46, { align: "center" });
      
      doc.setFontSize(10);
      doc.text(`TOTAL VISITS: ${filteredLogs.length}`, 20, 60);
      const avgDaily = filteredLogs.length > 0 ? (filteredLogs.length / 30).toFixed(1) : '0';
      doc.text(`AVG. DAILY: ${avgDaily}`, 80, 60);
      
      doc.line(20, 65, 190, 65);
      
      doc.setFontSize(10);
      doc.text("DATE", 20, 72);
      doc.text("REASON FOR VISIT", 70, 72);
      doc.text("COLLEGE/DEPARTMENT", 140, 72);
      
      doc.line(20, 75, 190, 75);
      
      let y = 82;
      filteredLogs.slice(0, 20).forEach(log => {
        const dateStr = log.timestamp?.toDate().toLocaleDateString() || '';
        doc.text(dateStr, 20, y);
        doc.text(log.reason || '', 70, y);
        doc.text(log.college || '', 140, y);
        y += 8;
      });
      
      doc.save("Library_Visitor_Report.pdf");
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please use the Print button instead.');
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'visitLogs'), (logsSnap) => {
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error(err);
    });
    return () => unsubscribe();
  }, []);

  const populateSampleData = async () => {
    try {
      const sampleLogs = [
        { uid: 'u1', userName: 'Alice', college: 'CAS', reason: 'Research', timestamp: Timestamp.now(), exitTimestamp: Timestamp.now() },
        { uid: 'u2', userName: 'Bob', college: 'CBA', reason: 'Study', timestamp: Timestamp.now(), exitTimestamp: Timestamp.now() },
        { uid: 'u3', userName: 'Charlie', college: 'CCS', reason: 'Meeting', timestamp: Timestamp.now(), exitTimestamp: Timestamp.now() },
        { uid: 'u4', userName: 'David', college: 'CAS', reason: 'Study', timestamp: Timestamp.now(), exitTimestamp: null },
        { uid: 'u5', userName: 'Eve', college: 'CBA', reason: 'Printing', timestamp: Timestamp.now(), exitTimestamp: null },
      ];
      for (const log of sampleLogs) {
        await addDoc(collection(db, 'visitLogs'), log);
      }
      
      // Recalculate occupancy
      const q = query(collection(db, 'visitLogs'), where('exitTimestamp', '==', null));
      const snap = await getDocs(q);
      const actualOccupancy = snap.size;
      const statsRef = doc(db, 'stats', 'library');
      await updateDoc(statsRef, { occupancy: actualOccupancy });

      alert('Sample data populated successfully!');
    } catch (error) {
      console.error('Error populating sample data:', error);
      alert('Failed to populate sample data.');
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (!log.timestamp) return false;
      const logDate = log.timestamp.toDate();
      
      let matchesDate = true;
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (logDate < start) matchesDate = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (logDate > end) matchesDate = false;
      }

      const matchesSearch = !searchTerm || 
                            log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            log.college?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [logs, startDate, endDate, searchTerm]);

  const chartData = useMemo(() => {
    const grouped = filteredLogs.reduce((acc, log) => {
      if (!log.timestamp) return acc;
      const dateStr = log.timestamp.toDate().toLocaleDateString();
      acc[dateStr] = (acc[dateStr] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.keys(grouped).map(date => ({
      date,
      visits: grouped[date]
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredLogs]);

  const averageStay = useMemo(() => {
    const completedVisits = filteredLogs.filter(log => log.exitTimestamp && log.timestamp);
    if (completedVisits.length === 0) return 0;
    const totalStay = completedVisits.reduce((acc, log) => {
      const stay = log.exitTimestamp.toDate().getTime() - log.timestamp.toDate().getTime();
      return acc + stay;
    }, 0);
    return (totalStay / completedVisits.length) / (1000 * 60); // in minutes
  }, [filteredLogs]);

  const collegeData = useMemo(() => {
    const grouped = filteredLogs.reduce((acc, log) => {
      const college = log.college || 'Unknown';
      acc[college] = (acc[college] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(grouped).map(name => ({ name, value: grouped[name] }));
  }, [filteredLogs]);

  const purposeData = useMemo(() => {
    const grouped = filteredLogs.reduce((acc, log) => {
      const reason = log.reason || 'Other';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const total = filteredLogs.length || 1;
    return Object.keys(grouped).map(name => ({
      name,
      value: grouped[name],
      percentage: Math.round((grouped[name] / total) * 100)
    })).sort((a, b) => b.value - a.value);
  }, [filteredLogs]);

  const peakHoursData = useMemo(() => {
    const hours = new Array(12).fill(0); // 8 AM to 7 PM
    filteredLogs.forEach(log => {
      if (log.timestamp) {
        const hour = log.timestamp.toDate().getHours();
        if (hour >= 8 && hour <= 19) {
          hours[hour - 8]++;
        }
      }
    });
    return hours.map((visits, i) => ({
      hour: `${i + 8 > 12 ? i + 8 - 12 : i + 8}${i + 8 >= 12 ? 'P' : 'A'}`,
      visits
    }));
  }, [filteredLogs]);

  const collegeRanking = useMemo(() => {
    const grouped = filteredLogs.reduce((acc, log) => {
      const college = log.college || 'Unknown';
      acc[college] = (acc[college] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const total = filteredLogs.length || 1;
    return Object.keys(grouped)
      .map(name => ({
        name,
        visits: grouped[name],
        engagement: Math.round((grouped[name] / total) * 100),
        trend: Math.random() > 0.5 ? 'up' : 'down' // Mock trend for now
      }))
      .sort((a, b) => b.visits - a.visits);
  }, [filteredLogs]);

  return (
    <div className="min-h-screen bg-[#0a1111] text-white p-4 md:p-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Detailed Analytics & Reports</h1>
          <p className="text-sm text-gray-400">Live Updates</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search reports..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1a2626] border-none rounded-lg py-2 pl-10 pr-4 text-sm" 
            />
          </div>
          <button onClick={populateSampleData} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-600 px-4 py-2 rounded-lg text-sm whitespace-nowrap">
            <Database className="w-4 h-4" /> Sample
          </button>
          <button onClick={handlePrint} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-teal-600 px-4 py-2 rounded-lg text-sm whitespace-nowrap">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={handleDownload} className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-teal-800 px-4 py-2 rounded-lg text-sm whitespace-nowrap">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </header>

      {/* Date Range & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        <div className="lg:col-span-3 bg-[#1a2626] p-4 rounded-xl flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-400 sm:hidden">Date Range:</span>
          </div>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full sm:w-auto bg-[#0a1111] p-2 rounded-lg text-sm" />
          <span className="hidden sm:inline">to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full sm:w-auto bg-[#0a1111] p-2 rounded-lg text-sm" />
        </div>
        <div className="bg-[#1a2626] p-4 rounded-xl flex justify-between items-center">
          <div>
            <p className="text-gray-400 text-xs">TOTAL VISITS</p>
            <p className="text-2xl font-bold">{filteredLogs.length}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">AVG STAY (MINS)</p>
            <p className="text-2xl font-bold text-teal-400">{averageStay.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* Top Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
        <div className="lg:col-span-2 bg-[#1a2626] p-4 md:p-6 rounded-xl">
          <h2 className="font-bold mb-1">Visitor Trends</h2>
          <p className="text-xs text-gray-400 mb-4">Daily foot traffic for the selected period</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" stroke="#4b5563" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip contentStyle={{ backgroundColor: '#0a1111', border: '1px solid #374151', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="visits" stroke="#0d9488" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-[#1a2626] p-4 md:p-6 rounded-xl">
          <h2 className="font-bold mb-1">Visits by College</h2>
          <p className="text-xs text-gray-400 mb-4">Student demographics distribution</p>
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={collegeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {collegeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0a1111', border: '1px solid #374151', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold">{filteredLogs.length}</span>
              <span className="text-xs text-gray-400">STUDENTS</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {collegeData.map((data, index) => (
              <div key={data.name} className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span>{data.name}</span>
                </div>
                <span className="font-bold">{Math.round((data.value / (filteredLogs.length || 1)) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Middle Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
        <div className="bg-[#1a2626] p-4 md:p-6 rounded-xl">
          <h2 className="font-bold mb-6">Purpose of Visit</h2>
          <div className="space-y-6">
            {purposeData.map((data, index) => (
              <div key={data.name}>
                <div className="flex justify-between text-xs mb-2">
                  <span className="uppercase text-gray-400 font-semibold">{data.name}</span>
                  <span className="text-teal-400">{data.value}</span>
                </div>
                <div className="h-1.5 w-full bg-[#0a1111] rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full" 
                    style={{ 
                      width: `${data.percentage}%`,
                      backgroundColor: COLORS[index % COLORS.length]
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#1a2626] p-4 md:p-6 rounded-xl">
          <h2 className="font-bold mb-4">Peak Hours Density</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHoursData}>
                <XAxis dataKey="hour" stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip cursor={{ fill: '#2d3748' }} contentStyle={{ backgroundColor: '#0a1111', border: '1px solid #374151', borderRadius: '8px' }} />
                <Bar dataKey="visits" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Table */}
      <div className="bg-[#1a2626] p-4 md:p-6 rounded-xl">
        <h2 className="font-bold mb-6">College Engagement Ranking</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px] md:text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="pb-2 md:pb-4 px-1 md:px-2 font-medium">RANK</th>
                <th className="pb-2 md:pb-4 px-1 md:px-2 font-medium">COLLEGE</th>
                <th className="pb-2 md:pb-4 px-1 md:px-2 font-medium">TOTAL VISITS</th>
                <th className="pb-2 md:pb-4 px-1 md:px-2 font-medium">ENGAGEMENT RATE</th>
                <th className="pb-2 md:pb-4 px-1 md:px-2 font-medium">TREND</th>
              </tr>
            </thead>
            <tbody>
              {collegeRanking.map((college, index) => (
                <tr key={college.name} className="border-b border-gray-800/50">
                  <td className="py-2 md:py-4 px-1 md:px-2 font-bold">#{index + 1}</td>
                  <td className="py-2 md:py-4 px-1 md:px-2">
                    <span className="text-teal-400 font-bold mr-2 truncate max-w-[80px] md:max-w-none block md:inline">{college.name}</span>
                  </td>
                  <td className="py-2 md:py-4 px-1 md:px-2">{college.visits}</td>
                  <td className="py-2 md:py-4 px-1 md:px-2">
                    <div className="flex items-center gap-2 md:gap-4">
                      <div className="w-16 md:w-24 h-1.5 bg-[#0a1111] rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${college.engagement}%` }}></div>
                      </div>
                      <span className="font-bold">{college.engagement}%</span>
                    </div>
                  </td>
                  <td className="py-2 md:py-4 px-1 md:px-2">
                    {college.trend === 'up' ? (
                      <TrendingUp className="w-3 h-3 md:w-4 md:h-4 text-teal-400" />
                    ) : (
                      <TrendingDown className="w-3 h-3 md:w-4 md:h-4 text-red-400" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Hidden Print Component */}
      <div className="absolute -top-[9999px] -left-[9999px]">
        <PrintReport ref={printRef} logs={filteredLogs} startDate={startDate} endDate={endDate} />
      </div>
    </div>
  );
};

export default AdminAnalytics;
