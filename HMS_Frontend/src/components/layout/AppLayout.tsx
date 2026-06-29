import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  Pill,
  TestTube2,
  Receipt,
  Shield,
  PackageSearch,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  ChevronDown,
  Bell,
  SmilePlus,
  Eye,
  GitBranch,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getInitials } from "@/lib/utils";
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  /** If omitted, the item is visible to all authenticated users. */
  roles?: UserRole[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: <LayoutDashboard className="w-4.5 h-4.5" />,
    // visible to everyone
  },
  {
    label: "Patients",
    to: "/patients",
    icon: <Users className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "DISTRICT_HD",
      "DOCTOR",
      "NURSE",
      "MED_OFFICER",
      "RECORDS",
      "RECEPTION",
      "REGISTRAR",
      "DENTIST",
      "DENTAL_TECH",
      "DENTAL_SURGEON",
      "OPTOMETRIST",
      "OPHTHALMOLOGIST",
    ],
  },
  {
    label: "Appointments",
    to: "/appointments",
    icon: <CalendarDays className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "DOCTOR",
      "NURSE",
      "MED_OFFICER",
      "RECORDS",
      "RECEPTION",
      "REGISTRAR",
      "DENTIST",
      "DENTAL_TECH",
      "DENTAL_SURGEON",
      "OPTOMETRIST",
      "OPHTHALMOLOGIST",
    ],
  },
  {
    label: "Clinical",
    to: "/clinical",
    icon: <Stethoscope className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "DOCTOR",
      "NURSE",
      "MED_OFFICER",
    ],
  },
  {
    label: "Dental",
    to: "/dental",
    icon: <SmilePlus className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "DENTIST",
      "DENTAL_TECH",
      "DENTAL_SURGEON",
    ],
  },
  {
    label: "Eye Clinic",
    to: "/eye",
    icon: <Eye className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "OPTOMETRIST",
      "OPHTHALMOLOGIST",
    ],
  },
  {
    label: "Pharmacy",
    to: "/pharmacy",
    icon: <Pill className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "PHARMACIST",
      "DOCTOR",
      "NURSE",
      "MED_OFFICER",
    ],
  },
  {
    label: "Laboratory",
    to: "/lab",
    icon: <TestTube2 className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "LAB_TECH",
      "DOCTOR",
      "MED_OFFICER",
    ],
  },
  {
    label: "Billing",
    to: "/billing",
    icon: <Receipt className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "ACCOUNTS",
      "CASHIER",
      "INSURANCE",
      "RECEPTION",
    ],
  },
  {
    label: "Insurance",
    to: "/insurance",
    icon: <Shield className="w-4.5 h-4.5" />,
    roles: ["SUPER_ADMIN", "SYS_ADMIN", "MED_SUPT", "INSURANCE", "ACCOUNTS"],
  },
  {
    label: "Inventory",
    to: "/inventory",
    icon: <PackageSearch className="w-4.5 h-4.5" />,
    roles: [
      "SUPER_ADMIN",
      "SYS_ADMIN",
      "MED_SUPT",
      "INVENTORY",
      "PHARMACIST",
      "LAB_TECH",
    ],
  },
  {
    label: "Reports",
    to: "/reports",
    icon: <BarChart3 className="w-4.5 h-4.5" />,
    roles: ["SUPER_ADMIN", "SYS_ADMIN", "MED_SUPT", "DISTRICT_HD", "ACCOUNTS"],
  },
  {
    label: "Branches",
    to: "/branches",
    icon: <GitBranch className="w-4.5 h-4.5" />,
    roles: ["SUPER_ADMIN", "SYS_ADMIN", "MED_SUPT"],
  },
  {
    label: "Admin",
    to: "/admin",
    icon: <Settings className="w-4.5 h-4.5" />,
    roles: ["SUPER_ADMIN", "SYS_ADMIN", "MED_SUPT"],
  },
];

function SidebarItem({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
          isActive
            ? "bg-primary-700 text-white"
            : "text-primary-100 hover:bg-primary-700/60 hover:text-white",
          collapsed && "justify-center px-2",
        )
      }
    >
      <span className="flex-shrink-0">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate("/login");
  };

  const sidebar = (
    <div
      className={cn(
        "flex flex-col h-full bg-primary-900 transition-all duration-300",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-primary-800",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center">
          <img
            src={import.meta.env.VITE_FACILITY_LOGO || "/assets/asl_logo.png"}
            alt="Logo"
            className="w-8 h-8 object-contain"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">
              {import.meta.env.VITE_FACILITY_NAME || "ASL HMS"}
            </p>
            <p className="text-primary-300 text-xs truncate">
              Hospital Management
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems
          .filter((item) => {
            if (!item.roles) return true; // visible to all
            // Primary check: single role code returned by backend
            if (user?.role && item.roles.includes(user.role)) return true;
            // Fallback: check the full roles array (also returned by backend)
            if (
              user?.roles?.some((r) =>
                item.roles!.includes(r.code as (typeof item.roles)[0]),
              )
            )
              return true;
            return false;
          })
          .map((item) => (
            <SidebarItem key={item.to} item={item} collapsed={collapsed} />
          ))}
      </nav>

      {/* User section */}
      <div
        className={cn(
          "p-3 border-t border-primary-800",
          collapsed && "flex flex-col items-center",
        )}
      >
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {getInitials(`${user.firstName} ${user.lastName}`)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-xs font-medium truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-primary-300 text-xs truncate">{user.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-primary-200 hover:bg-primary-700 hover:text-white transition-colors text-sm",
            collapsed && "justify-center",
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">{sidebar}</div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex h-full w-64">{sidebar}</div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="hidden md:flex p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              {collapsed ? (
                <Menu className="w-5 h-5" />
              ) : (
                <X className="w-5 h-5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger-500 rounded-full" />
            </button>

            {/* Profile dropdown */}
            {user && (
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-semibold">
                    {getInitials(`${user.firstName} ${user.lastName}`)}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-gray-900 leading-none">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500">{user.role}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                </button>

                {/* Dropdown menu */}
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
                    {/* User info header */}
                    <div className="px-4 py-3 border-b border-gray-50">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {user.email}
                      </p>
                    </div>

                    {/* Menu items */}
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        navigate("/profile");
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4 text-gray-400" />
                      Profile
                    </button>

                    <div className="border-t border-gray-50 my-1" />

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-4 md:px-6 py-3">
          <p className="text-xs text-gray-400 text-center">
            ASL Health Management System | 0249730545 / 0233302007
          </p>
        </footer>
      </div>
    </div>
  );
}
