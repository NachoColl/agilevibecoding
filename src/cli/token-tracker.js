import fs from 'fs';
import path from 'path';

export class TokenTracker {
  constructor(avcPath = path.join(process.cwd(), '.avc')) {
    this.avcPath = avcPath;
    this.tokenHistoryPath = path.join(avcPath, 'token-history.json');
    this.data = null;
  }

  /**
   * Initialize token history file if it doesn't exist
   */
  init() {
    // Ensure .avc directory exists
    if (!fs.existsSync(this.avcPath)) {
      fs.mkdirSync(this.avcPath, { recursive: true });
    }

    if (!fs.existsSync(this.tokenHistoryPath)) {
      const initialData = {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        totals: {
          daily: {},
          weekly: {},
          monthly: {},
          allTime: {
            input: 0,
            output: 0,
            total: 0,
            executions: 0
          }
        }
      };
      this._writeData(initialData);
    }
  }

  /**
   * Load token history from disk
   */
  load() {
    if (fs.existsSync(this.tokenHistoryPath)) {
      this.data = JSON.parse(fs.readFileSync(this.tokenHistoryPath, 'utf8'));
    } else {
      this.init();
      this.data = JSON.parse(fs.readFileSync(this.tokenHistoryPath, 'utf8'));
    }
    return this.data;
  }

  /**
   * Write data to disk atomically
   */
  _writeData(data) {
    try {
      const tempPath = this.tokenHistoryPath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.tokenHistoryPath);
    } catch (error) {
      fs.writeFileSync(this.tokenHistoryPath, JSON.stringify(data, null, 2), 'utf8');
    }
  }

  /**
   * Add tokens from a completed ceremony execution
   * @param {string} ceremonyType - e.g., 'sponsor-call'
   * @param {Object} tokens - { input, output }
   */
  addExecution(ceremonyType, tokens) {
    this.load();

    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const weekKey = this._getWeekKey(now);            // YYYY-Www
    const monthKey = dateKey.substring(0, 7);         // YYYY-MM
    const timestamp = now.toISOString();

    const tokenData = {
      input: tokens.input || 0,
      output: tokens.output || 0,
      total: (tokens.input || 0) + (tokens.output || 0)
    };

    // Update totals (global)
    this._updateAggregation(this.data.totals, dateKey, weekKey, monthKey, tokenData, timestamp);

    // Update ceremony-specific aggregations
    if (!this.data[ceremonyType]) {
      this.data[ceremonyType] = {
        daily: {},
        weekly: {},
        monthly: {},
        allTime: {
          input: 0,
          output: 0,
          total: 0,
          executions: 0
        }
      };
    }
    this._updateAggregation(this.data[ceremonyType], dateKey, weekKey, monthKey, tokenData, timestamp);

    // Update lastUpdated
    this.data.lastUpdated = timestamp;

    // Write to disk
    this._writeData(this.data);
  }

  /**
   * Update aggregations for a given scope (totals or ceremony-type)
   */
  _updateAggregation(scope, dateKey, weekKey, monthKey, tokenData, timestamp) {
    // Update daily
    if (!scope.daily[dateKey]) {
      scope.daily[dateKey] = {
        date: dateKey,
        input: 0,
        output: 0,
        total: 0,
        executions: 0
      };
    }
    scope.daily[dateKey].input += tokenData.input;
    scope.daily[dateKey].output += tokenData.output;
    scope.daily[dateKey].total += tokenData.total;
    scope.daily[dateKey].executions++;

    // Update weekly
    if (!scope.weekly[weekKey]) {
      scope.weekly[weekKey] = {
        week: weekKey,
        input: 0,
        output: 0,
        total: 0,
        executions: 0
      };
    }
    scope.weekly[weekKey].input += tokenData.input;
    scope.weekly[weekKey].output += tokenData.output;
    scope.weekly[weekKey].total += tokenData.total;
    scope.weekly[weekKey].executions++;

    // Update monthly
    if (!scope.monthly[monthKey]) {
      scope.monthly[monthKey] = {
        month: monthKey,
        input: 0,
        output: 0,
        total: 0,
        executions: 0
      };
    }
    scope.monthly[monthKey].input += tokenData.input;
    scope.monthly[monthKey].output += tokenData.output;
    scope.monthly[monthKey].total += tokenData.total;
    scope.monthly[monthKey].executions++;

    // Update all-time
    scope.allTime.input += tokenData.input;
    scope.allTime.output += tokenData.output;
    scope.allTime.total += tokenData.total;
    scope.allTime.executions++;

    if (!scope.allTime.firstExecution) {
      scope.allTime.firstExecution = timestamp;
    }
    scope.allTime.lastExecution = timestamp;

    // Cleanup old rolling windows
    this._cleanupRollingWindows();
  }

  /**
   * Get ISO week key (YYYY-Www)
   */
  _getWeekKey(date) {
    const tempDate = new Date(date.getTime());
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((tempDate - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${tempDate.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  /**
   * Cleanup old entries from rolling windows
   */
  _cleanupRollingWindows() {
    const now = new Date();

    // Keep last 31 days
    const cutoffDaily = new Date(now);
    cutoffDaily.setDate(cutoffDaily.getDate() - 31);

    // Clean totals.daily
    Object.keys(this.data.totals.daily).forEach(key => {
      if (new Date(key) < cutoffDaily) {
        delete this.data.totals.daily[key];
      }
    });

    // Clean ceremony-type daily
    Object.keys(this.data).forEach(key => {
      if (key !== 'version' && key !== 'lastUpdated' && key !== 'totals' && this.data[key].daily) {
        Object.keys(this.data[key].daily).forEach(dateKey => {
          if (new Date(dateKey) < cutoffDaily) {
            delete this.data[key].daily[dateKey];
          }
        });
      }
    });

    // Keep last 12 weeks
    const cutoffWeekly = new Date(now);
    cutoffWeekly.setDate(cutoffWeekly.getDate() - 84);

    Object.keys(this.data.totals.weekly).forEach(key => {
      const [year, week] = key.split('-W');
      const weekDate = this._getDateFromWeek(parseInt(year), parseInt(week));
      if (weekDate < cutoffWeekly) {
        delete this.data.totals.weekly[key];
      }
    });

    Object.keys(this.data).forEach(key => {
      if (key !== 'version' && key !== 'lastUpdated' && key !== 'totals' && this.data[key].weekly) {
        Object.keys(this.data[key].weekly).forEach(weekKey => {
          const [year, week] = weekKey.split('-W');
          const weekDate = this._getDateFromWeek(parseInt(year), parseInt(week));
          if (weekDate < cutoffWeekly) {
            delete this.data[key].weekly[weekKey];
          }
        });
      }
    });

    // Keep last 12 months
    const cutoffMonthly = new Date(now);
    cutoffMonthly.setMonth(cutoffMonthly.getMonth() - 12);

    Object.keys(this.data.totals.monthly).forEach(key => {
      if (new Date(key + '-01') < cutoffMonthly) {
        delete this.data.totals.monthly[key];
      }
    });

    Object.keys(this.data).forEach(key => {
      if (key !== 'version' && key !== 'lastUpdated' && key !== 'totals' && this.data[key].monthly) {
        Object.keys(this.data[key].monthly).forEach(monthKey => {
          if (new Date(monthKey + '-01') < cutoffMonthly) {
            delete this.data[key].monthly[monthKey];
          }
        });
      }
    });
  }

  /**
   * Get date from ISO week
   */
  _getDateFromWeek(year, week) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
  }

  // Query methods
  getTotalsToday() {
    this.load();
    const today = new Date().toISOString().split('T')[0];
    return this.data.totals.daily[today] || { date: today, input: 0, output: 0, total: 0, executions: 0 };
  }

  getTotalsThisWeek() {
    this.load();
    const week = this._getWeekKey(new Date());
    return this.data.totals.weekly[week] || { week, input: 0, output: 0, total: 0, executions: 0 };
  }

  getTotalsThisMonth() {
    this.load();
    const month = new Date().toISOString().substring(0, 7);
    return this.data.totals.monthly[month] || { month, input: 0, output: 0, total: 0, executions: 0 };
  }

  getTotalsAllTime() {
    this.load();
    return this.data.totals.allTime;
  }

  getCeremonyToday(ceremonyType) {
    this.load();
    const today = new Date().toISOString().split('T')[0];
    return this.data[ceremonyType]?.daily[today] || { date: today, input: 0, output: 0, total: 0, executions: 0 };
  }

  getCeremonyThisWeek(ceremonyType) {
    this.load();
    const week = this._getWeekKey(new Date());
    return this.data[ceremonyType]?.weekly[week] || { week, input: 0, output: 0, total: 0, executions: 0 };
  }

  getCeremonyThisMonth(ceremonyType) {
    this.load();
    const month = new Date().toISOString().substring(0, 7);
    return this.data[ceremonyType]?.monthly[month] || { month, input: 0, output: 0, total: 0, executions: 0 };
  }

  getCeremonyAllTime(ceremonyType) {
    this.load();
    return this.data[ceremonyType]?.allTime || { input: 0, output: 0, total: 0, executions: 0 };
  }

  getAllCeremonyTypes() {
    this.load();
    return Object.keys(this.data).filter(key =>
      key !== 'version' && key !== 'lastUpdated' && key !== 'totals'
    );
  }
}
