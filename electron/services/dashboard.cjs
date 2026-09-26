const { createDashboardRepository } = require('../repositories/dashboard.cjs');
const {dateKey,parseDate,range,safeNumbers,profitAmounts}=require('../utils/analytics.cjs');
function createDashboardService(db, clock = () => new Date()) {
  const repository = createDashboardRepository(db);
  return {
    getOverview(input) {
      const filters = range(input,clock());
      // Deferred read transaction: all panels represent one database snapshot, with no writes.
      const result = safeNumbers(db.transaction(()=>repository.overview(filters)).deferred());
      const { summary } = result;
      summary.grossProfit = profitAmounts(summary.salesRevenue,summary.historicalCost,summary.unknownCostItemCount).grossProfit;
      const values = new Map(result.salesTrend.map((row)=>[row.bucket,row]));
      const cursor = parseDate(filters.from);
      if (filters.bucketLength===7) cursor.setDate(1);
      result.salesTrend=[];
      while (dateKey(cursor)<=filters.to) {
        const bucket=dateKey(cursor).slice(0,filters.bucketLength);
        result.salesTrend.push(values.get(bucket) ?? {bucket,revenue:0,count:0});
        if (filters.bucketLength===7) cursor.setMonth(cursor.getMonth()+1); else cursor.setDate(cursor.getDate()+1);
      }
      return { ...result,range:{period:filters.period,from:filters.from,to:filters.to,grouping:filters.bucketLength===7?'month':'day',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone} };
    },
  };
}
module.exports = { createDashboardService, range };
