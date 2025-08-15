import React, { useState, useRef } from 'react';

interface ICAOInputProps {
  onAddICAOs: (icaos: string[]) => void;
}

export function ICAOInput({ onAddICAOs }: ICAOInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    const icaos = input
      .toUpperCase()
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));
    
    if (icaos.length > 0) {
      onAddICAOs(icaos);
      setInput('');
      // Auto-focus like original
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div className="flex justify-center gap-2 mb-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter ICAOs (e.g. CYYT,EGLL,KJFK)"
          className="bg-gray-700 p-2 rounded text-center w-72 transition-colors border border-gray-600 focus:outline-none focus:border-blue-400"
          maxLength={50}
        />
        <button
          type="submit"
          className="bg-blue-600 px-3 py-1 rounded text-white hover:bg-blue-700 transition-colors"
        >
          Add ICAO(s)
        </button>
      </form>
    </div>
  );
}
