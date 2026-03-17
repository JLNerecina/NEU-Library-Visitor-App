import React from 'react';
import { Library } from 'lucide-react';

interface PrintReportProps {
  logs: any[];
  startDate: string;
  endDate: string;
}

const PrintReport = React.forwardRef<HTMLDivElement, PrintReportProps>(({ logs, startDate, endDate }, ref) => {
  const totalVisits = logs.length;
  const avgDaily = logs.length > 0 ? (logs.length / 30).toFixed(1) : 0; // Simplified
  
  return (
    <div ref={ref} className="p-12 bg-white text-black min-h-screen">
      <div className="text-center mb-8">
        <Library className="w-16 h-16 mx-auto text-blue-800 mb-4" />
        <h1 className="text-2xl font-bold text-blue-900">NEU LIBRARY</h1>
        <h2 className="text-3xl font-bold mt-2">Library Visitor Report</h2>
        <p className="text-sm text-gray-500 uppercase mt-1">Reporting Period</p>
        <p className="font-semibold">{startDate || 'Start'} - {endDate || 'End'}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-12">
        <div className="bg-gray-50 p-4 rounded-lg border">
          <p className="text-xs text-gray-500">TOTAL VISITS</p>
          <p className="text-2xl font-bold">{totalVisits}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg border">
          <p className="text-xs text-gray-500">AVG. DAILY</p>
          <p className="text-2xl font-bold">{avgDaily}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg border">
          <p className="text-xs text-gray-500">PEAK DAY</p>
          <p className="text-2xl font-bold">N/A</p>
        </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="py-2">DATE</th>
            <th className="py-2">REASON FOR VISIT</th>
            <th className="py-2">COLLEGE/DEPARTMENT</th>
          </tr>
        </thead>
        <tbody>
          {logs.slice(0, 10).map((log, i) => (
            <tr key={i} className="border-b">
              <td className="py-3">{log.timestamp?.toDate().toLocaleDateString()}</td>
              <td className="py-3">{log.reason}</td>
              <td className="py-3">{log.college}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default PrintReport;
