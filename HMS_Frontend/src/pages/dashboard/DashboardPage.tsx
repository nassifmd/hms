import { useQuery } from "@tanstack/react-query";
import {
  Users,
  CalendarDays,
  Activity,
  DollarSign,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import api from "@/lib/api";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];

function StatCard({
  icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
}) {
  const bgMap = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 font-medium">{label}</span>
        <span className={`p-2 rounded-lg ${bgMap[color]}`}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: myDash, isLoading: loadingMy } = useQuery({
    queryKey: ["dashboard", "my"],
    queryFn: () => api.get("/dashboard/my").then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const { data: execDash, isLoading: loadingExec } = useQuery({
    queryKey: ["dashboard", "executive"],
    queryFn: () => api.get("/dashboard/executive").then((r) => r.data.data),
    enabled: ["SYS_ADMIN", "MED_SUPT", "DISTRICT_HD"].includes(
      user?.role ?? "",
    ),
    refetchInterval: 60_000,
  });

  const dash = execDash ?? myDash;
  const isLoading = loadingMy && loadingExec;

  // Backend executive dashboard returns: patients, visits, revenue, appointments, top_departments, daily_trend
  // Other dashboards may return flat stats object
  const stats = dash
    ? {
        totalPatients:
          dash.patients?.total_patients ??
          dash.patient_stats?.total_patients ??
          dash.stats?.total_patients ??
          0,
        newPatients30d:
          dash.patients?.new_patients_30d ??
          dash.patient_stats?.new_patients_30d ??
          dash.stats?.new_patients_30d ??
          0,
        todayVisits:
          dash.visits?.today_visits ??
          dash.visit_stats?.today_visits ??
          dash.stats?.today_visits ??
          0,
        emergencyVisits:
          dash.visits?.emergency_visits ??
          dash.visit_stats?.emergency_visits ??
          dash.stats?.emergency_visits ??
          0,
        todayAppointments:
          dash.appointments?.today_appointments ??
          dash.appointment_stats?.today_appointments ??
          dash.stats?.today_appointments ??
          0,
        pendingToday:
          dash.appointments?.pending_today ??
          dash.appointment_stats?.pending_today ??
          dash.stats?.pending_today ??
          0,
        revenueToday:
          dash.revenue?.revenue_today ??
          dash.revenue_stats?.revenue_today ??
          dash.stats?.revenue_today ??
          0,
        revenue30d:
          dash.revenue?.revenue_30d ??
          dash.revenue_stats?.revenue_30d ??
          dash.stats?.revenue_30d ??
          0,
      }
    : null;

  const dailyTrend: { date: string; visits: number }[] =
    dash?.daily_trend ?? [];
  const deptPerf: { department_name: string; visits_30d: number }[] =
    dash?.top_departments ?? dash?.department_performance ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Good {greet()}, {user?.firstName} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {formatDate(new Date(), "EEEE, dd MMMM yyyy")} · Here's what's
          happening today.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="w-5 h-5" />}
              label="Total Patients"
              value={formatNumber(stats?.totalPatients ?? 0)}
              sub={`+${stats?.newPatients30d ?? 0} this month`}
              color="blue"
            />
            <StatCard
              icon={<Activity className="w-5 h-5" />}
              label="Today's Visits"
              value={formatNumber(stats?.todayVisits ?? 0)}
              sub={`${stats?.emergencyVisits ?? 0} emergency`}
              color="green"
            />
            <StatCard
              icon={<CalendarDays className="w-5 h-5" />}
              label="Today's Appointments"
              value={formatNumber(stats?.todayAppointments ?? 0)}
              sub={`${stats?.pendingToday ?? 0} pending`}
              color="yellow"
            />
            <StatCard
              icon={<DollarSign className="w-5 h-5" />}
              label="Revenue Today"
              value={formatCurrency(stats?.revenueToday ?? 0)}
              sub={`${formatCurrency(stats?.revenue30d ?? 0)} this month`}
              color="purple"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily visit trend */}
            {dailyTrend.length > 0 && (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-800">
                    Daily Visit Trend (7 days)
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={dailyTrend}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="visitGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => formatDate(v, "dd MMM")}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v) => [v, "Visits"]}
                      labelFormatter={(l) => formatDate(l, "dd MMM yyyy")}
                    />
                    <Area
                      type="monotone"
                      dataKey="visits"
                      stroke="#3b82f6"
                      fill="url(#visitGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Department breakdown */}
            {deptPerf.length > 0 && (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-800">
                    Department Activity (30 days)
                  </h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={deptPerf}
                      dataKey="visits_30d"
                      nameKey="department_name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={false}
                      labelLine={false}
                    >
                      {deptPerf.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, name) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {deptPerf.map((dept, i) => (
                    <div
                      key={dept.department_name}
                      className="flex items-center gap-1.5 text-xs text-gray-600"
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span>{dept.department_name}</span>
                      <span className="text-gray-400">({dept.visits_30d})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quick actions / recent items */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickAction
              icon={<AlertCircle className="w-5 h-5 text-red-500" />}
              label="Emergency Visits"
              value={stats?.emergencyVisits ?? 0}
              desc="Active emergencies today"
              bg="bg-red-50"
            />
            <QuickAction
              icon={<Clock className="w-5 h-5 text-yellow-500" />}
              label="Pending Appointments"
              value={stats?.pendingToday ?? 0}
              desc="Need confirmation"
              bg="bg-yellow-50"
            />
            <QuickAction
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
              label="Patients This Month"
              value={stats?.newPatients30d ?? 0}
              desc="New registrations"
              bg="bg-green-50"
            />
          </div>
        </>
      )}
    </div>
  );
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function QuickAction({
  icon,
  label,
  value,
  desc,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  desc: string;
  bg: string;
}) {
  return (
    <div className={`card p-4 flex items-center gap-4 ${bg} border-0`}>
      <div className="bg-white rounded-xl p-3 shadow-sm">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
    </div>
  );
}
