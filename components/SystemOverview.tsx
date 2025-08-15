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
    avgDelayRisk: 0,
    totalPireps: 0,
    totalSigmets: 0
  });

  useEffect(() => {
    const totalStations = stations.length;
    const normalOps = stations.filter(s => s.operationalStatus === 'NORMAL').length;
    const cautionStations = stations.filter(s => s.operationalStatus === 'CAUTION').length;
    const criticalStations = stations.filter(s => s.operationalStatus === 'CRITICAL').length;
    const avgDelayRisk = totalStations > 0 
      ? Math.round(stations.reduce((sum, s) => sum + s.delayProbability, 0) / totalStations)
      : 0;
    const totalPireps = stations.reduce((sum, s) => sum + s.pireps.length, 0);
    const totalSigmets = stations.reduce((sum, s) => sum + s.sigmets.length, 0);

    setMetrics({
      totalStations,
      normalOps,
      cautionStations,
      criticalStations,
      avgDelayRisk,
      totalPireps,
      totalSigmets
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
          subtitle={`${Math.round((metrics.normalOps / metrics.totalStations) * 100) || 0}%`}
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
          title="Avg Delay Risk"
          value={`${metrics.avgDelayRisk}%`}
          subtitle="System wide"
          icon="⏱️"
          color="text-orange-400"
        />
        
        <MetricCard
          title="PIREPs"
          value={metrics.totalPireps}
          subtitle="Active reports"
          icon="🛩️"
          color="text-cyan-400"
        />
        
        <MetricCard
          title="SIGMETs"
          value={metrics.totalSigmets}
          subtitle="Active warnings"
          icon="⚡"
          color="text-purple-400"
        />
      </div>
    </div>
  );
}
