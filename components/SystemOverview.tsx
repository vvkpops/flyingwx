import React, { useState, useEffect } from 'react';
import { StationStatus } from '../types/weather';

interface SystemOverviewProps {
  stations: StationStatus[];
}

export function SystemOverview({ stations }: SystemOverviewProps) {
  const [metrics, setMetrics] = useState({
    totalStations: 0,
    normalOps: 0,
    cautionStations: 0,
    criticalStations: 0,
    totalActivePireps: 0,
    totalActiveSigmets: 0,
    totalExpiredSigmets: 0
  });

  useEffect(() => {
    const totalStations = stations.length;
    const normalOps = stations.filter(s => s.operationalStatus === 'NORMAL').length;
    const cautionStations = stations.filter(s => s.operationalStatus === 'CAUTION').length;
    const criticalStations = stations.filter(s => s.operationalStatus === 'CRITICAL').length;
    
    const totalActivePireps = stations.reduce((sum, s) => 
      sum + s.pireps.filter(p => !p.isExpired).length, 0
    );
    const totalActiveSigmets = stations.reduce((sum, s) => 
      sum + s.sigmets.filter(sig => sig.isActive).length, 0
    );
    const totalExpiredSigmets = stations.reduce((sum, s) => 
      sum + s.sigmets.filter(sig => sig.isExpired).length, 0
    );

    setMetrics({
      totalStations,
      normalOps,
      cautionStations,
      criticalStations,
      totalActivePireps,
      totalActiveSigmets,
      totalExpiredSigmets
    });
  }, [stations]);

  const MetricCard = ({ 
    title, 
    value, 
    subtitle, 
    color = 'text-blue-400',
    icon = '📊'
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    color?: string;
    icon?: string;
  }) => (
    <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      <div className="text-sm font-semibold text-white">{title}</div>
      {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
    </div>
  );

  return (
    <div className="bg-gray-800 rounded-xl p-4 mb-6">
      <h3 className="text-lg font-bold mb-4">System Overview</h3>
      
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <MetricCard
          title="Total Stations"
          value={metrics.totalStations}
          icon="🌍"
          color="text-blue-400"
        />
        
        <MetricCard
          title="Normal Ops"
          value={metrics.normalOps}
          subtitle={`${Math.round((metrics.normalOps / (metrics.totalStations || 1)) * 100)}%`}
          icon="✅"
          color="text-green-400"
        />
        
        <MetricCard
          title="Caution"
          value={metrics.cautionStations}
          subtitle="Stations"
          icon="⚠️"
          color="text-yellow-400"
        />
        
        <MetricCard
          title="Critical"
          value={metrics.criticalStations}
          subtitle="Stations"
          icon="🚨"
          color="text-red-400"
        />
        
        <MetricCard
          title="Active PIREPs"
          value={metrics.totalActivePireps}
          subtitle="Last 12hrs"
          icon="🛩️"
          color="text-cyan-400"
        />
        
        <MetricCard
          title="Active SIGMETs"
          value={metrics.totalActiveSigmets}
          subtitle="Current"
          icon="⚡"
          color="text-purple-400"
        />
        
        <MetricCard
          title="Expired"
          value={metrics.totalExpiredSigmets}
          subtitle="SIGMETs"
          icon="⏰"
          color="text-gray-400"
        />
      </div>
    </div>
  );
}
