import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Users,
  UserCheck,
  UserX,
  Shield,
  Pencil,
  Server,
  Activity,
  Database,
  Wifi,
  WifiOff,
  Save,
  RefreshCw,
  Trash2,
  Key,
  Lock,
  Unlock,
} from "lucide-react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useModules, GATED_MODULES } from "@/contexts/ModulesContext";
import type { User, Department } from "@/types";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Form";
import { formatDate, timeAgo, getInitials } from "@/lib/utils";

function formatSettingLabel(key: string) {
  return key.split("_").join(" ");
}

function formatUptime(seconds?: number) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const roleOptions: { value: string; label: string }[] = [
  { value: "SYS_ADMIN", label: "System Administrator" },
  { value: "MED_SUPT", label: "Medical Superintendent" },
  { value: "DOCTOR", label: "Doctor" },
  { value: "NURSE", label: "Nurse" },
  { value: "MED_OFFICER", label: "Medical Officer" },
  { value: "RECORDS", label: "Records Officer" },
  { value: "RECEPTION", label: "Receptionist" },
  { value: "REGISTRAR", label: "Registrar" },
  { value: "PHARMACIST", label: "Pharmacist" },
  { value: "LAB_TECH", label: "Lab Technician" },
  { value: "ACCOUNTS", label: "Accounts Officer" },
  { value: "CASHIER", label: "Cashier" },
  { value: "DENTIST", label: "Dentist" },
  { value: "DENTAL_TECH", label: "Dental Technician" },
  { value: "DENTAL_SURGEON", label: "Dental Surgeon" },
  { value: "OPTOMETRIST", label: "Optometrist" },
  { value: "OPHTHALMOLOGIST", label: "Ophthalmologist" },
  { value: "INSURANCE", label: "Insurance Officer" },
  { value: "INVENTORY", label: "Inventory Manager" },
];

export default function AdminPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const {
    statuses: moduleStatuses,
    isLoading: modulesLoading,
    refresh: refreshModules,
  } = useModules();
  const isSysAdmin =
    user?.role === "SYS_ADMIN" ||
    user?.roles?.some((r) => r.code === "SYS_ADMIN");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "users" | "roles" | "departments" | "settings" | "audit" | "modules"
  >("users");
  const [moduleLicenseKeys, setModuleLicenseKeys] = useState<
    Record<string, string>
  >({});
  const [settingsCategory, setSettingsCategory] = useState<string>("General");
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>(
    {},
  );
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [editRole, setEditRole] = useState<{
    id: string;
    role_code: string;
    role_name: string;
  } | null>(null);
  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [editDept, setEditDept] = useState<{
    id: string;
    department_code: string;
    department_name: string;
    department_type: string;
  } | null>(null);
  const [roleManageUser, setRoleManageUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const roleForm = useForm<{ role_code: string; role_name: string }>();
  const deptForm = useForm<{
    department_code: string;
    department_name: string;
    department_type: string;
  }>();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () =>
      api
        .get("/users", { params: { search: search || undefined, limit: 30 } })
        .then((r) => r.data),
  });

  const { data: departmentsData, isLoading: deptsLoading } = useQuery({
    queryKey: ["admin", "departments"],
    queryFn: () =>
      api.get("/admin/departments").then((r) => r.data.data as Department[]),
    staleTime: 5 * 60 * 1000,
  });

  interface Role {
    id: string;
    role_code: string;
    role_name: string;
  }
  const { data: rolesData, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["admin", "roles"],
    queryFn: () => api.get("/admin/roles").then((r) => r.data.data as Role[]),
    enabled: activeTab === "roles" || activeTab === "users",
    staleTime: 5 * 60 * 1000,
  });

  const departmentOptions = (departmentsData ?? []).map((d) => ({
    value: d.id,
    label: d.departmentName,
  }));

  const { data: auditData } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () =>
      api
        .get("/admin/audit-logs", { params: { limit: 30 } })
        .then((r) => r.data),
    enabled: activeTab === "audit",
  });

  interface SettingRow {
    key: string;
    value: string;
    description: string;
  }
  interface SettingsMap {
    [category: string]: SettingRow[];
  }
  const { data: settingsData, isLoading: settingsLoading } =
    useQuery<SettingsMap>({
      queryKey: ["admin", "settings"],
      queryFn: () =>
        api.get("/admin/settings").then((r) => r.data.data as SettingsMap),
      enabled: activeTab === "settings",
    });

  interface HealthData {
    database: { status: string; connections?: number };
    redis?: { status: string; cached_keys?: number; mode?: string };
    uptime?: number;
    memory?: { rss: number; heapUsed: number; heapTotal: number };
    storage?: Record<string, unknown>;
  }
  const { data: healthData, refetch: refetchHealth } = useQuery<HealthData>({
    queryKey: ["admin", "health"],
    queryFn: () =>
      api.get("/admin/health").then((r) => r.data.data as HealthData),
    enabled: activeTab === "settings",
    refetchInterval: 30_000,
  });

  // Populate draft from fetched settings (only when data arrives)
  useEffect(() => {
    if (!settingsData) return;
    const flat: Record<string, string> = {};
    Object.values(settingsData)
      .flat()
      .forEach((s: SettingRow) => {
        flat[s.key] = s.value;
      });
    setSettingsDraft(flat);
  }, [settingsData]);

  const saveSettingsMutation = useMutation({
    mutationFn: (
      settings: {
        key: string;
        value: string;
        category: string;
        description: string;
      }[],
    ) => api.put("/admin/settings", { settings }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const clearCacheMutation = useMutation({
    mutationFn: () => api.post("/admin/clear-cache"),
    onSuccess: () => toast.success("Cache cleared"),
    onError: () => toast.error("Failed to clear cache"),
  });

  // Roles CRUD
  const createRoleMutation = useMutation({
    mutationFn: (d: { role_code: string; role_name: string }) =>
      api.post("/admin/roles", d),
    onSuccess: () => {
      toast.success("Role created");
      qc.invalidateQueries({ queryKey: ["admin", "roles"] });
      setAddRoleOpen(false);
      roleForm.reset();
    },
    onError: () => toast.error("Failed to create role"),
  });
  const updateRoleMutation = useMutation({
    mutationFn: ({
      id,
      ...d
    }: {
      id: string;
      role_code: string;
      role_name: string;
    }) => api.put(`/admin/roles/${id}`, d),
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin", "roles"] });
      setEditRole(null);
    },
    onError: () => toast.error("Failed to update role"),
  });
  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/roles/${id}`),
    onSuccess: () => {
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["admin", "roles"] });
    },
    onError: () => toast.error("Failed to delete role"),
  });

  // Departments CRUD
  const createDeptMutation = useMutation({
    mutationFn: (d: {
      department_code: string;
      department_name: string;
      department_type: string;
    }) => api.post("/admin/departments", d),
    onSuccess: () => {
      toast.success("Department created");
      qc.invalidateQueries({ queryKey: ["admin", "departments"] });
      setAddDeptOpen(false);
      deptForm.reset();
    },
    onError: () => toast.error("Failed to create department"),
  });
  const updateDeptMutation = useMutation({
    mutationFn: ({
      id,
      ...d
    }: {
      id: string;
      department_code: string;
      department_name: string;
      department_type: string;
    }) => api.put(`/admin/departments/${id}`, d),
    onSuccess: () => {
      toast.success("Department updated");
      qc.invalidateQueries({ queryKey: ["admin", "departments"] });
      setEditDept(null);
    },
    onError: () => toast.error("Failed to update department"),
  });
  const deleteDeptMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/departments/${id}`),
    onSuccess: () => {
      toast.success("Department deleted");
      qc.invalidateQueries({ queryKey: ["admin", "departments"] });
    },
    onError: () => toast.error("Failed to delete department"),
  });

  function handleSaveCategory() {
    if (!settingsData) return;
    const rows = settingsData[settingsCategory] ?? [];
    const payload = rows.map((s: SettingRow) => ({
      key: s.key,
      value: settingsDraft[s.key] ?? s.value,
      category: settingsCategory,
      description: s.description,
    }));
    saveSettingsMutation.mutate(payload);
  }

  const users: User[] = data?.users ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (!payload.role) throw new Error("A role must be selected");
      // Normalize camelCase form fields to snake_case for the backend
      const body: Record<string, unknown> = {
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        password: payload.password,
        phone_number: payload.phone || undefined,
        department_id: payload.department_id || undefined,
        role_code: payload.role,
      };
      return api.post("/users", body);
    },
    onSuccess: () => {
      toast.success("User created successfully");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setAddOpen(false);
      addForm.reset();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Failed to create user";
      toast.error(msg);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => {
      toast.success("User status updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: () => toast.error("Failed to update user"),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, ...body }: EditUserForm & { id: string }) =>
      api.put(`/users/${id}`, body),
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setEditUser(null);
    },
    onError: () => toast.error("Failed to update user"),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success("User deactivated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: () => toast.error("Failed to delete user"),
  });

  const unlockUserMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/unlock`),
    onSuccess: () => {
      toast.success("User account unlocked");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Failed to unlock user";
      toast.error(msg);
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.post(`/users/${userId}/roles`, { roleId }),
    onSuccess: () => {
      toast.success("Role assigned");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: () => toast.error("Failed to assign role"),
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      api.delete(`/users/${userId}/roles/${roleId}`),
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: () => toast.error("Failed to remove role"),
  });

  const moduleActivateMutation = useMutation({
    mutationFn: ({
      module_code,
      license_key,
    }: {
      module_code: string;
      license_key: string;
    }) => api.post("/admin/modules/activate", { module_code, license_key }),
    onSuccess: (_data, vars) => {
      toast.success(`${vars.module_code} module activated!`);
      refreshModules();
      setModuleLicenseKeys((k) => ({ ...k, [vars.module_code]: "" }));
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Invalid license key";
      toast.error(msg);
    },
  });

  type CreateUserForm = Partial<User> & {
    password: string;
    department_id?: string;
  };
  const addForm = useForm<CreateUserForm>();

  type EditUserForm = {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    gender: string;
    department_id: string;
    employment_status: string;
  };
  const editForm = useForm<EditUserForm>();

  const userColumns = [
    {
      key: "name",
      header: "Name",
      render: (r: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-semibold flex-shrink-0">
            {getInitials(`${r.firstName} ${r.lastName}`)}
          </div>
          <div>
            <p className="font-medium text-gray-900">
              {r.firstName} {r.lastName}
            </p>
            <p className="text-xs text-gray-400">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Roles",
      render: (r: User) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(r.roles && r.roles.length > 0
            ? r.roles.map((rl) => rl.name)
            : r.role
              ? [r.role]
              : []
          )
            .slice(0, 2)
            .map((name) => (
              <span key={name} className="badge-blue text-xs">
                {name}
              </span>
            ))}
          {r.roles && r.roles.length > 2 && (
            <span className="text-xs text-gray-400">+{r.roles.length - 2}</span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setRoleManageUser(r);
            }}
            className="p-1 rounded hover:bg-primary-50 text-primary-500"
            title="Manage roles"
          >
            <Shield className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (r: User) => r.department ?? "—",
    },
    {
      key: "lastLogin",
      header: "Last Login",
      render: (r: User) => (r.lastLogin ? timeAgo(r.lastLogin) : "Never"),
    },
    {
      key: "isActive",
      header: "Status",
      render: (r: User) => (
        <div className="flex items-center gap-2">
          <button
            role="switch"
            aria-checked={r.isActive}
            onClick={() =>
              toggleActiveMutation.mutate({ id: r.id, isActive: !r.isActive })
            }
            disabled={toggleActiveMutation.isPending}
            title={r.isActive ? "Click to deactivate" : "Click to activate"}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              r.isActive ? "bg-green-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                r.isActive ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          {r.accountLocked && (
            <button
              onClick={() => unlockUserMutation.mutate(r.id)}
              disabled={unlockUserMutation.isPending}
              className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100"
              title="Account locked — click to unlock"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (r: User) => formatDate(r.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (r: User) => (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setEditUser(r);
              editForm.reset({
                first_name: r.firstName,
                last_name: r.lastName,
                email: r.email,
                phone_number: r.phone ?? "",
                gender: r.gender ?? "",
                department_id: r.departmentId ?? "",
                employment_status: r.employmentStatus ?? "Permanent",
              });
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            title="Edit user"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (
                !confirm(
                  `Delete user ${r.firstName} ${r.lastName}? This will deactivate their account.`,
                )
              )
                return;
              deleteUserMutation.mutate(r.id);
            }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
            title="Delete user"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  interface AuditLog {
    id: string;
    user_id?: string;
    user_name?: string;
    action: string;
    table_name?: string;
    ip_address?: string;
    created_at: string;
  }
  const auditColumns = [
    {
      key: "user_id",
      header: "User",
      render: (r: AuditLog) => r.user_name ?? r.user_id ?? "—",
    },
    {
      key: "action",
      header: "Action",
      render: (r: AuditLog) => (
        <span className="badge-blue text-xs">{r.action}</span>
      ),
    },
    {
      key: "table_name",
      header: "Resource",
      render: (r: AuditLog) => r.table_name ?? "—",
    },
    {
      key: "ip_address",
      header: "IP",
      render: (r: AuditLog) => (
        <span className="font-mono text-xs">{r.ip_address ?? "—"}</span>
      ),
    },
    {
      key: "created_at",
      header: "Time",
      render: (r: AuditLog) => timeAgo(r.created_at),
    },
  ];

  const tabs = [
    { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { id: "roles", label: "Roles", icon: <Shield className="w-4 h-4" /> },
    { id: "departments", label: "Departments", icon: null },
    { id: "audit", label: "Audit Log", icon: null },
    { id: "settings", label: "Settings", icon: null },
    { id: "modules", label: "Modules", icon: <Key className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Administration"
        subtitle="System users, roles and audit logs"
        actions={
          activeTab === "users" ? (
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAddOpen(true)}
              size="sm"
            >
              Add User
            </Button>
          ) : activeTab === "roles" ? (
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setAddRoleOpen(true);
                roleForm.reset();
              }}
              size="sm"
            >
              Add Role
            </Button>
          ) : activeTab === "departments" ? (
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setAddDeptOpen(true);
                deptForm.reset();
              }}
              size="sm"
            >
              Add Department
            </Button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? "bg-white shadow-sm text-primary-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && (
        <>
          {/* User stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: "Total Users",
                value: users.length,
                icon: <Users className="w-5 h-5 text-blue-600" />,
                bg: "bg-blue-50",
              },
              {
                label: "Active",
                value: users.filter((u) => u.isActive).length,
                icon: <UserCheck className="w-5 h-5 text-green-600" />,
                bg: "bg-green-50",
              },
              {
                label: "Inactive",
                value: users.filter((u) => !u.isActive).length,
                icon: <UserX className="w-5 h-5 text-red-500" />,
                bg: "bg-red-50",
              },
            ].map((s) => (
              <div key={s.label} className="card p-4 flex items-center gap-3">
                <div className={`${s.bg} p-2.5 rounded-xl`}>{s.icon}</div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-3 flex items-center gap-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>

          <DataTable
            columns={userColumns}
            data={users}
            keyField="id"
            isLoading={isLoading}
            emptyMessage="No users found"
          />
        </>
      )}

      {activeTab === "roles" && (
        <div className="space-y-4">
          {rolesLoading && (
            <div className="card p-8 text-center text-gray-400">
              Loading roles…
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {(rolesData ?? []).map((r) => (
              <div
                key={r.id}
                className="card p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">{r.role_name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {r.role_code}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditRole(r);
                      roleForm.setValue("role_code", r.role_code);
                      roleForm.setValue("role_name", r.role_name);
                    }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this role?"))
                        deleteRoleMutation.mutate(r.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "departments" && (
        <div className="space-y-4">
          {deptsLoading && (
            <div className="card p-8 text-center text-gray-400">
              Loading departments…
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {(departmentsData ?? []).map((d) => (
              <div
                key={d.id}
                className="card p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {d.departmentName}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    {
                      (d as unknown as { departmentCode?: string })
                        .departmentCode
                    }
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const dd = d as unknown as {
                        id: string;
                        departmentCode: string;
                        departmentName: string;
                        departmentType: string;
                      };
                      setEditDept({
                        id: dd.id,
                        department_code: dd.departmentCode,
                        department_name: dd.departmentName,
                        department_type: dd.departmentType,
                      });
                      deptForm.setValue("department_code", dd.departmentCode);
                      deptForm.setValue("department_name", dd.departmentName);
                      deptForm.setValue("department_type", dd.departmentType);
                    }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this department?"))
                        deleteDeptMutation.mutate(d.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "audit" && (
        <DataTable
          columns={auditColumns}
          data={auditData?.logs ?? []}
          keyField="id"
          isLoading={false}
          emptyMessage="No audit logs found"
        />
      )}

      {activeTab === "settings" && (
        <div className="space-y-5">
          {/* System Health */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary-600" />
                <h3 className="font-semibold text-gray-900">System Health</h3>
              </div>
              <button
                onClick={() => refetchHealth()}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                title="Refresh health"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Database */}
              <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg flex-shrink-0 ${healthData?.database?.status === "healthy" ? "bg-green-100" : "bg-red-100"}`}
                >
                  <Database
                    className={`w-4 h-4 ${healthData?.database?.status === "healthy" ? "text-green-600" : "text-red-500"}`}
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Database</p>
                  <p
                    className={`text-sm font-semibold capitalize ${healthData?.database?.status === "healthy" ? "text-green-600" : "text-red-500"}`}
                  >
                    {healthData?.database?.status ?? "—"}
                  </p>
                  {healthData?.database?.connections != null && (
                    <p className="text-xs text-gray-400">
                      {healthData.database.connections} connections
                    </p>
                  )}
                </div>
              </div>

              {/* Redis */}
              <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg flex-shrink-0 ${healthData?.redis?.status === "healthy" ? "bg-green-100" : "bg-yellow-100"}`}
                >
                  {healthData?.redis?.status === "healthy" ? (
                    <Wifi className="w-4 h-4 text-green-600" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Redis Cache</p>
                  <p
                    className={`text-sm font-semibold capitalize ${healthData?.redis?.status === "healthy" ? "text-green-600" : "text-yellow-600"}`}
                  >
                    {healthData?.redis?.status ?? "—"}
                  </p>
                  {healthData?.redis?.cached_keys != null && (
                    <p className="text-xs text-gray-400">
                      {healthData.redis.cached_keys} keys cached
                    </p>
                  )}
                  {healthData?.redis?.mode === "in-memory" && (
                    <p className="text-xs text-gray-400">in-memory</p>
                  )}
                </div>
              </div>

              {/* Uptime */}
              <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-lg flex-shrink-0">
                  <Server className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Uptime</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {formatUptime(healthData?.uptime)}
                  </p>
                </div>
              </div>

              {/* Memory */}
              <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-3">
                <div className="bg-purple-100 p-2 rounded-lg flex-shrink-0">
                  <Activity className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Memory Used</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {formatBytes(healthData?.memory?.rss)}
                  </p>
                  {healthData?.memory?.heapUsed != null && (
                    <p className="text-xs text-gray-400">
                      heap {formatBytes(healthData.memory.heapUsed)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Clear cache action */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => clearCacheMutation.mutate()}
                disabled={clearCacheMutation.isPending}
                className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${clearCacheMutation.isPending ? "animate-spin" : ""}`}
                />
                Clear Redis Cache
              </button>
            </div>
          </div>

          {/* Settings form */}
          <div className="card overflow-hidden">
            {settingsLoading && (
              <div className="p-8 text-center text-gray-400">
                Loading settings…
              </div>
            )}
            {!settingsLoading && !settingsData && (
              <div className="p-8 text-center text-gray-400">
                No settings found
              </div>
            )}
            {!settingsLoading && settingsData && (
              <>
                {/* Category sub-tabs */}
                <div className="flex overflow-x-auto border-b border-gray-100">
                  {Object.keys(settingsData).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSettingsCategory(cat)}
                      className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        settingsCategory === cat
                          ? "border-primary-600 text-primary-700 bg-primary-50/40"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Fields */}
                <div className="divide-y divide-gray-50">
                  {(settingsData[settingsCategory] ?? []).map(
                    (s: SettingRow) => {
                      const isBool = s.value === "true" || s.value === "false";
                      const currentVal = settingsDraft[s.key] ?? s.value;
                      return (
                        <div
                          key={s.key}
                          className="flex items-center justify-between px-6 py-4 gap-4"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 capitalize">
                              {formatSettingLabel(s.key)}
                            </p>
                            {s.description && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {s.description}
                              </p>
                            )}
                          </div>
                          <div className="flex-shrink-0">
                            {isBool ? (
                              <button
                                role="switch"
                                aria-checked={currentVal === "true"}
                                onClick={() =>
                                  setSettingsDraft((d) => ({
                                    ...d,
                                    [s.key]:
                                      currentVal === "true" ? "false" : "true",
                                  }))
                                }
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  currentVal === "true"
                                    ? "bg-primary-600"
                                    : "bg-gray-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    currentVal === "true"
                                      ? "translate-x-6"
                                      : "translate-x-1"
                                  }`}
                                />
                              </button>
                            ) : (
                              <input
                                type="text"
                                value={currentVal ?? ""}
                                onChange={(e) =>
                                  setSettingsDraft((d) => ({
                                    ...d,
                                    [s.key]: e.target.value,
                                  }))
                                }
                                className="w-52 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 bg-white"
                              />
                            )}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>

                {/* Save bar */}
                <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={handleSaveCategory}
                    disabled={saveSettingsMutation.isPending}
                    className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {saveSettingsMutation.isPending
                      ? "Saving…"
                      : `Save ${settingsCategory}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modules Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "modules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Manage paid-module licenses for your facility. Each module can be
              activated with a license key obtained from HMS Support.
            </p>
            <button
              onClick={refreshModules}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              title="Refresh module status"
            >
              <RefreshCw
                className={`w-4 h-4 ${modulesLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {GATED_MODULES.map((mod) => {
              const status = moduleStatuses[mod.code];
              const isActive = status?.active === true;
              const daysLeft = status?.days_remaining ?? 0;
              const isExpiring = isActive && daysLeft > 0 && daysLeft <= 30;
              const keyVal = moduleLicenseKeys[mod.code] ?? "";

              let borderClass: string;
              if (!isActive) {
                borderClass = "border-l-gray-300";
              } else if (isExpiring) {
                borderClass = "border-l-amber-400";
              } else {
                borderClass = "border-l-green-500";
              }

              let badgeClass: string;
              if (!isActive) {
                badgeClass = "bg-gray-100 text-gray-500";
              } else if (isExpiring) {
                badgeClass = "bg-amber-100 text-amber-700";
              } else {
                badgeClass = "bg-green-100 text-green-700";
              }

              let badgeLabel: string;
              if (!isActive) {
                badgeLabel = "Inactive";
              } else if (isExpiring) {
                badgeLabel = "Expiring";
              } else {
                badgeLabel = "Active";
              }

              const pluralDays = daysLeft === 1 ? "day" : "days";

              let activateLabel: string;
              if (moduleActivateMutation.isPending) {
                activateLabel = "Activating…";
              } else if (isActive) {
                activateLabel = "Renew";
              } else {
                activateLabel = "Activate";
              }

              const licenseInputId = `license-key-${mod.code}`;

              return (
                <div
                  key={mod.code}
                  className={`card p-5 space-y-4 border-l-4 ${borderClass}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{mod.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {mod.description}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>

                  {/* Expiry info */}
                  {isActive && status?.expires_at && (
                    <div className="text-xs text-gray-400">
                      {isExpiring ? (
                        <span className="text-amber-600 font-medium">
                          Expires in {daysLeft} {pluralDays}
                        </span>
                      ) : (
                        <span>
                          Expires{" "}
                          {new Date(status.expires_at).toLocaleDateString()}
                        </span>
                      )}
                      {status.license_id && (
                        <span className="ml-2 font-mono text-gray-300">
                          #{status.license_id}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Activation form — SYS_ADMIN only */}
                  {isSysAdmin && (
                    <div className="space-y-2 pt-1 border-t border-gray-100">
                      <label
                        htmlFor={licenseInputId}
                        className="block text-xs font-medium text-gray-500"
                      >
                        {isActive
                          ? "Renew license key"
                          : "Activate with license key"}
                      </label>
                      <input
                        id={licenseInputId}
                        type="text"
                        value={keyVal}
                        onChange={(e) =>
                          setModuleLicenseKeys((k) => ({
                            ...k,
                            [mod.code]: e.target.value,
                          }))
                        }
                        placeholder={`HMS-${mod.code}-…`}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <button
                        onClick={() =>
                          moduleActivateMutation.mutate({
                            module_code: mod.code,
                            license_key: keyVal.trim(),
                          })
                        }
                        disabled={
                          !keyVal.trim() || moduleActivateMutation.isPending
                        }
                        className="w-full text-xs font-medium bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white py-1.5 rounded-lg transition-colors"
                      >
                        {activateLabel}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      <Modal
        open={addRoleOpen}
        onClose={() => setAddRoleOpen(false)}
        title="Create Role"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddRoleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={roleForm.handleSubmit((d) =>
                createRoleMutation.mutate(d),
              )}
              isLoading={createRoleMutation.isPending}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Role Code" required>
            <Input
              {...roleForm.register("role_code", { required: true })}
              placeholder="e.g. DOCTOR"
            />
          </FormField>
          <FormField label="Role Name" required>
            <Input
              {...roleForm.register("role_name", { required: true })}
              placeholder="e.g. Doctor"
            />
          </FormField>
        </div>
      </Modal>

      {/* Edit Role Modal */}
      <Modal
        open={!!editRole}
        onClose={() => setEditRole(null)}
        title="Edit Role"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRole(null)}>
              Cancel
            </Button>
            <Button
              onClick={roleForm.handleSubmit(
                (d) =>
                  editRole &&
                  updateRoleMutation.mutate({ id: editRole.id, ...d }),
              )}
              isLoading={updateRoleMutation.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Role Code" required>
            <Input {...roleForm.register("role_code", { required: true })} />
          </FormField>
          <FormField label="Role Name" required>
            <Input {...roleForm.register("role_name", { required: true })} />
          </FormField>
        </div>
      </Modal>

      {/* Add Department Modal */}
      <Modal
        open={addDeptOpen}
        onClose={() => setAddDeptOpen(false)}
        title="Create Department"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddDeptOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={deptForm.handleSubmit((d) =>
                createDeptMutation.mutate(d),
              )}
              isLoading={createDeptMutation.isPending}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Code" required>
            <Input
              {...deptForm.register("department_code", { required: true })}
              placeholder="e.g. OPD"
            />
          </FormField>
          <FormField label="Name" required>
            <Input
              {...deptForm.register("department_name", { required: true })}
              placeholder="e.g. Outpatient"
            />
          </FormField>
          <FormField label="Type" required>
            <Input
              {...deptForm.register("department_type", { required: true })}
              placeholder="e.g. Clinical"
            />
          </FormField>
        </div>
      </Modal>

      {/* Edit Department Modal */}
      <Modal
        open={!!editDept}
        onClose={() => setEditDept(null)}
        title="Edit Department"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditDept(null)}>
              Cancel
            </Button>
            <Button
              onClick={deptForm.handleSubmit(
                (d) =>
                  editDept &&
                  updateDeptMutation.mutate({ id: editDept.id, ...d }),
              )}
              isLoading={updateDeptMutation.isPending}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Code" required>
            <Input
              {...deptForm.register("department_code", { required: true })}
            />
          </FormField>
          <FormField label="Name" required>
            <Input
              {...deptForm.register("department_name", { required: true })}
            />
          </FormField>
          <FormField label="Type" required>
            <Input
              {...deptForm.register("department_type", { required: true })}
            />
          </FormField>
        </div>
      </Modal>

      {/* Manage Roles Modal */}
      <Modal
        open={!!roleManageUser}
        onClose={() => setRoleManageUser(null)}
        title={`Manage Roles — ${roleManageUser?.firstName ?? ""} ${roleManageUser?.lastName ?? ""}`}
        size="sm"
        footer={<Button onClick={() => setRoleManageUser(null)}>Done</Button>}
      >
        <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
          {roleOptions.map((opt) => {
            const roleObj = (rolesData ?? []).find(
              (ro) => ro.role_code === opt.value,
            );
            const userRole = (roleManageUser?.roles ?? []).find(
              (ur) => ur.code === opt.value,
            );
            const isOn = !!userRole;
            const isPending =
              assignRoleMutation.isPending || removeRoleMutation.isPending;
            return (
              <div
                key={opt.value}
                className="flex items-center justify-between py-3 px-1"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {opt.label}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">{opt.value}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={isOn}
                  disabled={isPending || !roleObj}
                  onClick={() => {
                    if (!roleManageUser || !roleObj) return;
                    if (isOn && userRole) {
                      removeRoleMutation.mutate(
                        { userId: roleManageUser.id, roleId: userRole.id },
                        {
                          onSuccess: () =>
                            setRoleManageUser((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    roles: (prev.roles ?? []).filter(
                                      (ur) => ur.code !== opt.value,
                                    ),
                                  }
                                : null,
                            ),
                        },
                      );
                    } else {
                      assignRoleMutation.mutate(
                        { userId: roleManageUser.id, roleId: roleObj.id },
                        {
                          onSuccess: () =>
                            setRoleManageUser((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    roles: [
                                      ...(prev.roles ?? []),
                                      {
                                        id: roleObj.id,
                                        code: roleObj.role_code,
                                        name: roleObj.role_name,
                                      },
                                    ],
                                  }
                                : null,
                            ),
                        },
                      );
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    isOn ? "bg-primary-600" : "bg-gray-300"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      isOn ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Edit User — ${editUser?.firstName ?? ""} ${editUser?.lastName ?? ""}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={editForm.handleSubmit(
                (d) =>
                  editUser &&
                  updateUserMutation.mutate({ id: editUser.id, ...d }),
              )}
              isLoading={updateUserMutation.isPending}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="First Name" required>
            <Input
              {...editForm.register("first_name", { required: "Required" })}
            />
          </FormField>
          <FormField label="Last Name" required>
            <Input
              {...editForm.register("last_name", { required: "Required" })}
            />
          </FormField>
          <FormField label="Email" required className="sm:col-span-2">
            <Input
              type="email"
              {...editForm.register("email", { required: "Required" })}
            />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" {...editForm.register("phone_number")} />
          </FormField>
          <FormField label="Gender">
            <Select
              options={[
                { value: "Male", label: "Male" },
                { value: "Female", label: "Female" },
                { value: "Other", label: "Other" },
              ]}
              placeholder="Select gender"
              {...editForm.register("gender")}
            />
          </FormField>
          <FormField label="Department">
            <Select
              options={departmentOptions}
              placeholder={departmentsData ? "Select department" : "Loading…"}
              {...editForm.register("department_id")}
            />
          </FormField>
          <FormField label="Employment Status">
            <Select
              options={[
                { value: "Permanent", label: "Permanent" },
                { value: "Contract", label: "Contract" },
                { value: "Locum", label: "Locum" },
                { value: "Intern", label: "Intern" },
              ]}
              placeholder="Select status"
              {...editForm.register("employment_status")}
            />
          </FormField>
        </form>
      </Modal>

      {/* Add User Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Create New User"
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={addForm.handleSubmit((d) => createMutation.mutate(d))}
              isLoading={createMutation.isPending}
            >
              Create User
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          onSubmit={(e) => e.preventDefault()}
        >
          <FormField
            label="First Name"
            required
            error={addForm.formState.errors.firstName?.message}
          >
            <Input
              {...addForm.register("firstName", { required: "Required" })}
            />
          </FormField>
          <FormField
            label="Last Name"
            required
            error={addForm.formState.errors.lastName?.message}
          >
            <Input
              {...addForm.register("lastName", { required: "Required" })}
            />
          </FormField>
          <FormField
            label="Email"
            required
            className="sm:col-span-2"
            error={addForm.formState.errors.email?.message}
          >
            <Input
              type="email"
              {...addForm.register("email", { required: "Required" })}
            />
          </FormField>
          <FormField
            label="Password"
            required
            error={addForm.formState.errors.password?.message}
          >
            <Input
              type="password"
              {...addForm.register("password", {
                required: "Required",
                minLength: { value: 8, message: "Min 8 characters" },
              })}
            />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" {...addForm.register("phone")} />
          </FormField>
          <FormField
            label="Role"
            required
            error={addForm.formState.errors.role?.message}
          >
            <Select
              options={roleOptions}
              placeholder="Select role"
              {...addForm.register("role", { required: "Required" })}
            />
          </FormField>
          <FormField label="Department">
            <Select
              options={departmentOptions}
              placeholder={departmentsData ? "Select department" : "Loading…"}
              {...addForm.register("department_id")}
            />
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
