'use client';

import React, { useEffect, useState } from 'react';
import { Brain, Download, Filter, RefreshCw, Trash2, Upload } from 'lucide-react';
import {
  AnalysisRecord,
  AnalysisStatistics,
  analysisRecordService,
} from '@/services/analysisRecordService';

export default function RecordsList() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [statistics, setStatistics] = useState<AnalysisStatistics | null>(null);
  const [filterLevel, setFilterLevel] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    loadRecords();
    loadStatistics();
  }, [filterLevel]);

  const loadRecords = () => {
    let allRecords = analysisRecordService.getAllRecords();
    if (filterLevel !== null) {
      allRecords = analysisRecordService.getRecordsByLevel(filterLevel);
    }
    setRecords(allRecords);
  };

  const loadStatistics = () => {
    setStatistics(analysisRecordService.getStatistics());
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
          alert(
            `Successfully imported ${result.imported} records${
              result.errors.length > 0 ? `, ${result.errors.length} records have errors` : ''
            }`,
          );
          loadRecords();
          loadStatistics();
        } else {
          alert(`Import failed: ${result.errors.join(', ')}`);
        }
      } catch {
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

  const formatDate = (timestamp: string) =>
    new Date(timestamp).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const createSampleRecords = () => {
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

    sampleRecords.forEach((record) => {
      analysisRecordService.saveRecord(record);
    });

    loadRecords();
    loadStatistics();
  };

  return (
    <div>
      {/* Header / actions */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Analysis Records</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowImportDialog(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Upload size={14} />
            Import
          </button>
          <button
            onClick={handleExportRecords}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download size={14} />
            Export
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            disabled={records.length === 0}
          >
            <Trash2 size={14} />
            Clear
          </button>
          <button
            onClick={() => {
              loadRecords();
              loadStatistics();
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Total</h3>
            <p className="text-2xl font-bold text-blue-600">{statistics.totalAnalyses}</p>
          </div>
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Avg Level</h3>
            <p className="text-2xl font-bold text-orange-600">{statistics.averageLevel}</p>
          </div>
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Avg Confidence</h3>
            <p className="text-2xl font-bold text-green-600">{statistics.averageConfidence}%</p>
          </div>
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Trend</h3>
            <p
              className={`text-2xl font-bold ${
                statistics.recentTrend === 'improving'
                  ? 'text-green-600'
                  : statistics.recentTrend === 'declining'
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`}
            >
              {statistics.recentTrend === 'improving'
                ? 'Improving'
                : statistics.recentTrend === 'declining'
                ? 'Declining'
                : 'Stable'}
            </p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-neutral-700 mb-6">
        <div className="flex items-center gap-3">
          <Filter size={16} className="text-gray-500" />
          <span className="font-medium text-sm">Filter:</span>
          <select
            value={filterLevel ?? ''}
            onChange={(e) => setFilterLevel(e.target.value ? parseInt(e.target.value) : null)}
            className="px-3 py-1.5 text-sm border rounded-md dark:bg-neutral-700 dark:border-neutral-600"
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

      {/* List */}
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-700">
        {records.length === 0 ? (
          <div className="p-8 text-center">
            <Brain size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-500 mb-2">No Analysis Records</h3>
            <p className="text-gray-400 text-sm mb-4">
              Records will appear here after starting AI analysis.
            </p>
            <button
              onClick={createSampleRecords}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Create Sample Records
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-neutral-700">
            {records.map((record) => (
              <div key={record.id} className="p-5">
                <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">Analysis #{record.analysisCount}</h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(
                        record.parkinsonLevel,
                      )}`}
                    >
                      {getSeverityText(record.parkinsonLevel)} (Lv {record.parkinsonLevel})
                    </span>
                    <span className="text-xs text-gray-500">
                      Source:{' '}
                      {record.source === 'arduino'
                        ? 'Arduino Device'
                        : record.source === 'web-analysis'
                        ? 'Web Analysis'
                        : 'Manual Input'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{formatDate(record.timestamp)}</span>
                    <button
                      onClick={() => setShowDeleteConfirm(record.id)}
                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-gray-50 dark:bg-neutral-700 p-3 rounded">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Confidence</p>
                    <p className="font-medium text-sm">{record.confidence}%</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-neutral-700 p-3 rounded">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Resistance</p>
                    <p className="font-medium text-sm">{record.recommendedResistance}°</p>
                  </div>
                  {record.duration && (
                    <div className="bg-gray-50 dark:bg-neutral-700 p-3 rounded">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Duration</p>
                      <p className="font-medium text-sm">{record.duration}s</p>
                    </div>
                  )}
                </div>

                {record.recommendation && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                    <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                      Training Recommendation
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">{record.recommendation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm */}
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
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700"
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

      {/* Clear confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-4">Clear All Records</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure? This will delete {records.length} records and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700"
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

      {/* Import dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-800 rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-4">Import Records</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Select a JSON file to import.
            </p>
            <input
              type="file"
              accept=".json"
              onChange={handleImportRecords}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-neutral-700 dark:border-neutral-600 mb-4"
            />
            <button
              onClick={() => setShowImportDialog(false)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
