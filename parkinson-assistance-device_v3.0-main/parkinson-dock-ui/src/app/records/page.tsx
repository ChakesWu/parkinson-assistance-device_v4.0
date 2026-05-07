'use client';

import React, { useState, useEffect } from 'react';
import { Brain, Download, Trash2, Filter, Upload, RefreshCw } from 'lucide-react';
import { analysisRecordService, AnalysisRecord, AnalysisStatistics } from '@/services/analysisRecordService';
import AppTopBar from '@/components/ui/AppTopBar';


export default function RecordsPage() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [statistics, setStatistics] = useState<AnalysisStatistics | null>(null);
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Load records and statistics
  useEffect(() => {
    console.log('Records page loaded, starting to load records...');
    console.log('localStorage availability:', typeof Storage !== 'undefined');
    console.log('Current localStorage content:', localStorage.getItem('parkinson_analysis_records'));
    loadRecords();
    loadStatistics();
  }, [filterLevel]);

  const loadRecords = () => {
    let allRecords = analysisRecordService.getAllRecords();
    console.log('Loading records:', allRecords.length, 'records');
    if (filterLevel !== null) {
      allRecords = analysisRecordService.getRecordsByLevel(filterLevel);
      console.log('Filtered records:', allRecords.length, 'records');
    }
    setRecords(allRecords);
  };

  const loadStatistics = () => {
    const stats = analysisRecordService.getStatistics();
    setStatistics(stats);
  };

  const handleDeleteRecord = (id: string) => {
    if (analysisRecordService.deleteRecord(id)) {
      loadRecords();
      loadStatistics();
      setShowDeleteConfirm(null);
    }
  };

  const handleExportRecords = () => {
    const exportData = analysisRecordService.exportRecords();
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parkinson_analysis_records_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportRecords = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string;
        const result = analysisRecordService.importRecords(jsonData);

        if (result.success) {
          alert(`Successfully imported ${result.imported} records${result.errors.length > 0 ? `, ${result.errors.length} records have errors` : ''}`);
          loadRecords();
          loadStatistics();
        } else {
          alert(`Import failed: ${result.errors.join(', ')}`);
        }
      } catch (error) {
        alert('File format error');
      }
    };
    reader.readAsText(file);
    setShowImportDialog(false);
  };

  const handleClearAllRecords = () => {
    analysisRecordService.clearAllRecords();
    loadRecords();
    loadStatistics();
    setShowClearConfirm(false);
  };

  const createSampleRecords = () => {
    // Create some sample records for testing
    const sampleRecords = [
      {
        analysisCount: 1,
        parkinsonLevel: 2,
        parkinsonDescription: 'Mild',
        confidence: 85.3,
        recommendation: 'Recommended moderate intensity finger dexterity training',
        recommendedResistance: 45,
        sensorData: {
          fingerPositions: [45, 52, 38, 41, 49],
          accelerometer: { x: 0.12, y: -0.34, z: 0.98 },
          gyroscope: { x: 1.2, y: -0.8, z: 0.3 },
          emg: 234,
        },
        analysisDetails: {
          tremorFrequency: 4.2,
          graspQuality: 68.5,
          emgRms: 156.7,
          overallSeverity: 42.3,
        },
        source: 'arduino' as const,
        duration: 10,
      },
      {
        analysisCount: 2,
        parkinsonLevel: 1,
        parkinsonDescription: 'Slight',
        confidence: 92.1,
        recommendation: 'Continue current training intensity, pay attention to finger coordination',
        recommendedResistance: 30,
        sensorData: {
          fingerPositions: [38, 42, 35, 39, 44],
          accelerometer: { x: 0.08, y: -0.28, z: 1.02 },
          gyroscope: { x: 0.8, y: -0.5, z: 0.2 },
          emg: 198,
        },
        analysisDetails: {
          tremorFrequency: 3.1,
          graspQuality: 72.8,
          emgRms: 142.3,
          overallSeverity: 28.7,
        },
        source: 'web-analysis' as const,
        duration: 10,
      },
      {
        analysisCount: 3,
        parkinsonLevel: 3,
        parkinsonDescription: 'Moderate',
        confidence: 78.9,
        recommendation: 'Need to increase training intensity, focus on improving tremor control',
        recommendedResistance: 60,
        sensorData: {
          fingerPositions: [52, 58, 45, 48, 55],
          accelerometer: { x: 0.18, y: -0.42, z: 0.94 },
          gyroscope: { x: 2.1, y: -1.3, z: 0.7 },
          emg: 287,
        },
        analysisDetails: {
          tremorFrequency: 5.8,
          graspQuality: 58.2,
          emgRms: 198.4,
          overallSeverity: 65.1,
        },
        source: 'arduino' as const,
        duration: 10,
      },
    ];

    sampleRecords.forEach(record => {
      analysisRecordService.saveRecord(record);
    });

    loadRecords();
    loadStatistics();
  };

  // Test localStorage directly
  const testLocalStorage = () => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        alert('localStorage not available');
        return;
      }

      console.log('Testing localStorage...');

      // Write test data directly
      const testData = [{
        id: 'test-123',
        timestamp: new Date().toISOString(),
        analysisCount: 1,
        parkinsonLevel: 2,
        parkinsonDescription: 'Test',
        confidence: 85,
        recommendation: 'Test recommendation',
        recommendedResistance: 45,
        source: 'web-analysis'
      }];

      localStorage.setItem('parkinson_analysis_records', JSON.stringify(testData));
      console.log('Test data written to localStorage');

      // Read verification
      const stored = localStorage.getItem('parkinson_analysis_records');
      console.log('Read data:', stored);

      loadRecords();
      loadStatistics();

      alert('localStorage test completed, please check console');
    } catch (error) {
      console.error('localStorage test failed:', error);
      alert('localStorage test failed');
    }
  };

  const getSeverityColor = (level: number) => {
    if (level <= 1) return 'bg-green-100 text-green-800';
    if (level <= 2) return 'bg-yellow-100 text-yellow-800';
    if (level <= 3) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const getSeverityText = (level: number) => {
    const levels = ['Normal', 'Slight', 'Mild', 'Moderate', 'Severe', 'Critical'];
    return levels[level] || 'Unknown';
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 flex flex-col">
      <AppTopBar showBack />
      <main className="flex-1 container mx-auto py-12 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">AI Analysis Records</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload size={16} />
              Import Records
            </button>
            <button
              onClick={handleExportRecords}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={16} />
              Export Records
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              disabled={records.length === 0}
            >
              <Trash2 size={16} />
              Clear Records
            </button>
            <button
              onClick={() => { loadRecords(); loadStatistics(); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              onClick={testLocalStorage}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
            >
              Test Storage
            </button>
          </div>
        </div>

        {/* Statistics cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Analyses</h3>
              <p className="text-2xl font-bold text-blue-600">{statistics.totalAnalyses}</p>
            </div>
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Average Level</h3>
              <p className="text-2xl font-bold text-orange-600">{statistics.averageLevel}</p>
            </div>
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Average Confidence</h3>
              <p className="text-2xl font-bold text-green-600">{statistics.averageConfidence}%</p>
            </div>
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Trend</h3>
              <p className={`text-2xl font-bold ${
                statistics.recentTrend === 'improving' ? 'text-green-600' :
                statistics.recentTrend === 'declining' ? 'text-red-600' : 'text-gray-600'
              }`}>
                {statistics.recentTrend === 'improving' ? 'Improving' :
                 statistics.recentTrend === 'declining' ? 'Declining' : 'Stable'}
              </p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow mb-6">
          <div className="flex items-center gap-4">
            <Filter size={16} />
            <span className="font-medium">Filter:</span>
            <select
              value={filterLevel || ''}
              onChange={(e) => setFilterLevel(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-1 border rounded-md dark:bg-neutral-700 dark:border-neutral-600"
            >
              <option value="">All Levels</option>
              <option value="0">Normal (Level 0)</option>
              <option value="1">Slight (Level 1)</option>
              <option value="2">Mild (Level 2)</option>
              <option value="3">Moderate (Level 3)</option>
              <option value="4">Severe (Level 4)</option>
              <option value="5">Critical (Level 5)</option>
            </select>
          </div>
        </div>

        {/* Records list */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-lg">
          {records.length === 0 ? (
            <div className="p-8 text-center">
              <Brain size={48} className="mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-500 mb-2">No Analysis Records</h3>
              <p className="text-gray-400 mb-4">Records will appear here after starting AI analysis</p>
              <button
                onClick={createSampleRecords}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Sample Records
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-neutral-700">
              {records.map((record) => (
                <div key={record.id} className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">
                        Analysis #{record.analysisCount}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSeverityColor(record.parkinsonLevel)}`}>
                        {getSeverityText(record.parkinsonLevel)} (Level {record.parkinsonLevel})
                      </span>
                      <span className="text-sm text-gray-500">
                        Source: {record.source === 'arduino' ? 'Arduino Device' : record.source === 'web-analysis' ? 'Web Analysis' : 'Manual Input'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        {formatDate(record.timestamp)}
                      </span>
                      <button
                        onClick={() => setShowDeleteConfirm(record.id)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 dark:bg-neutral-700 p-3 rounded">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Confidence</p>
                      <p className="font-medium">{record.confidence}%</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-neutral-700 p-3 rounded">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Recommended Resistance</p>
                      <p className="font-medium">{record.recommendedResistance}°</p>
                    </div>
                    {record.duration && (
                      <div className="bg-gray-50 dark:bg-neutral-700 p-3 rounded">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Analysis Duration</p>
                        <p className="font-medium">{record.duration}s</p>
                      </div>
                    )}
                  </div>

                  {record.recommendation && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Training Recommendation</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">{record.recommendation}</p>
                    </div>
                  )}

                  {record.analysisDetails && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      {record.analysisDetails.tremorFrequency && (
                        <div>
                          <span className="text-gray-500">Tremor Frequency: </span>
                          <span className="font-medium">{record.analysisDetails.tremorFrequency.toFixed(2)} Hz</span>
                        </div>
                      )}
                      {record.analysisDetails.graspQuality && (
                        <div>
                          <span className="text-gray-500">Grasp Quality: </span>
                          <span className="font-medium">{record.analysisDetails.graspQuality.toFixed(1)}%</span>
                        </div>
                      )}
                      {record.analysisDetails.emgRms && (
                        <div>
                          <span className="text-gray-500">EMG RMS: </span>
                          <span className="font-medium">{record.analysisDetails.emgRms.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-sm mx-4">
              <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete this analysis record? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteRecord(showDeleteConfirm)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear all records confirmation dialog */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-sm mx-4">
              <h3 className="text-lg font-semibold mb-4">Confirm Clear All Records</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to clear all analysis records? This action cannot be undone and will delete {records.length} records.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearAllRecords}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import records dialog */}
        {showImportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-sm mx-4">
              <h3 className="text-lg font-semibold mb-4">Import Analysis Records</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Select a JSON format record file to import.
              </p>
              <div className="mb-6">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportRecords}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-neutral-700 dark:border-neutral-600"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowImportDialog(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

    </div>
  );
}