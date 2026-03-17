import React, { useState } from 'react';
import { MapPin, BookOpen, Info, Search } from 'lucide-react';

const LibraryMap: React.FC = () => {
  const [activeLevel, setActiveLevel] = useState('Level 1 (Main)');
  
  const accentBlue = '#3b82f6'; 
  const secondaryBlue = '#60a5fa'; 
  const bgDark = '#0a1111'; // Match AdminAnalytics background
  const panelDark = '#1a2626'; // Match AdminAnalytics panel

  const levels = ['Level 2', 'Level 1 (Main)'];

  return (
    <div className="p-4 md:p-8 min-h-screen" style={{ backgroundColor: bgDark, color: 'white' }}>
      <h1 className="text-3xl md:text-4xl font-bold mb-2">Library Floor Plan</h1>
      <p className="text-gray-400 mb-8">Find your way around the NEU University Main Library. Explore study zones, quiet areas, and collection stacks.</p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 rounded-2xl border border-white/10" style={{ backgroundColor: panelDark }}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Floor Navigator</h3>
            <div className="space-y-2">
              {levels.map(level => (
                <button 
                  key={level}
                  onClick={() => setActiveLevel(level)}
                  className={`w-full text-left p-4 rounded-xl flex justify-between items-center transition-colors ${activeLevel === level ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'hover:bg-white/5'}`}
                >
                  {level}
                  {activeLevel === level && <span className="text-blue-400">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-white/10" style={{ backgroundColor: panelDark }}>
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4">Legend</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-blue-500"></div> Study Zones</div>
              <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: accentBlue }}></div> Book Stacks</div>
              <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: secondaryBlue }}></div> Tech Center</div>
              <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-indigo-400"></div> Restrooms</div>
            </div>
          </div>
        </div>

        {/* Map Area */}
        <div className="lg:col-span-3 p-6 rounded-3xl border border-white/10" style={{ backgroundColor: panelDark }}>
          <div className="w-full h-96 flex items-center justify-center border-2 border-dashed border-white/10 rounded-2xl">
            <span className="text-gray-500">Interactive Floor Plan for {activeLevel}</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
              <div className="flex items-center gap-3 mb-3 text-blue-400"><Info /> <h4 className="font-bold">Infographic View</h4></div>
              <p className="text-sm text-gray-400">Currently viewing {activeLevel} layout. Features the Information Desk, Cafe, and Special Collections wing.</p>
            </div>
            <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
              <div className="flex items-center gap-3 mb-3 text-yellow-500"><Search /> <h4 className="font-bold">Quick Navigation</h4></div>
              <p className="text-sm text-gray-400">Search for specific book call numbers or faculty offices using the search tool in the header.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibraryMap;
