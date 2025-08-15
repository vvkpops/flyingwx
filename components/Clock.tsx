import React, { useState, useEffect } from 'react';

interface ClockProps {
  position: 'left' | 'right';
}

export function Clock({ position }: ClockProps) {
  const [time, setTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!mounted || !time) {
    return (
      <div className={`${position === 'left' 
        ? 'absolute left-4 top-1/2 -translate-y-1/2'
        : 'absolute right-4 top-1/2 -translate-y-1/2'} text-lg font-mono text-gray-300`}>
        --:--:--
      </div>
    );
  }

  const displayTime = position === 'left' 
    ? `${time.toLocaleTimeString()} Local`
    : `${time.toUTCString().slice(17, 25)} UTC`;

  const positionClass = position === 'left' 
    ? 'absolute left-4 top-1/2 -translate-y-1/2'
    : 'absolute right-4 top-1/2 -translate-y-1/2';

  return (
    <div className={`${positionClass} text-lg font-mono text-gray-300`}>
      {displayTime}
    </div>
  );
}
