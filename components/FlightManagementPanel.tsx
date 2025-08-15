import React from 'react';

export function FlightManagementPanel() {
  // Since we don't have flight data, show a simple panel
  return (
    <div className="bg-gray-800 rounded-xl p-4 mb-6">
      <h3 className="text-lg font-bold mb-4 flex items-center">
        ✈️ Flight Operations
        <span className="ml-2 text-sm bg-blue-600 px-2 py-1 rounded">
          Connect Flight System
        </span>
      </h3>
      
      <div className="text-center py-8 text-gray-400">
        <div className="text-lg mb-2">Flight Management Integration</div>
        <div className="text-sm">
          Connect your flight operations system to monitor active flights and their weather impact.
        </div>
      </div>
    </div>
  );
}
