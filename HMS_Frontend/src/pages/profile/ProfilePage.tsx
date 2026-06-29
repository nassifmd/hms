import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import toast from "react-hot-toast"
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  Save,
  Lock,
  Eye,
  EyeOff,
  Building2,
  ChevronRight,
} from "lucide-react"
import api from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import PageHeader from "@/components/ui/PageHeader"
import Button from "@/components/ui/Button"
import { FormField, Input, Select } from "@/components/ui/Form"
import { formatDate } from "@/lib/utils"

interface ProfileFormData {
  first_name: string
  last_name: string
  phone_number: string
  alternate_phone: string
  email: string
  gender: string
  address: string
  city: string
  region: string
  postal_code: string
  date_of_birth: string
  national_id_type: string
  national_id_number: string
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
}

interface PasswordFormData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const genderOptions = [
  { value: "", label: "— Select —" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Other", label: "Other" },
]

export default function ProfilePage() {
  const { user, refresh } = useAuth()
  const [activeTab, setActiveTab] = useState<"profile" | "password">("profile")
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const profileForm = useForm<ProfileFormData>()
  const passwordForm = useForm<PasswordFormData>()

  // Fetch full profile
  const { data: profileData, isLoading } = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => api.get("/auth/me").then((r) => r.data.data.user),
  })

  // Populate form when data arrives
  useEffect(() => {
    if (profileData) {
      profileForm.reset({
        first_name: profileData.firstName ?? profileData.first_name ?? "",
        last_name: profileData.lastName ?? profileData.last_name ?? "",
        phone_number: profileData.phone ?? profileData.phone_number ?? "",
        alternate_phone: profileData.alternate_phone ?? "",
        email: profileData.email ?? "",
        gender: profileData.gender ?? "",
        address: profileData.address ?? "",
        city: profileData.city ?? "",
        region: profileData.region ?? "",
        postal_code: profileData.postal_code ?? "",
        date_of_birth: profileData.date_of_birth
          ? profileData.date_of_birth.slice(0, 10)
          : "",
        national_id_type: profileData.national_id_type ?? "",
        national_id_number: profileData.national_id_number ?? "",
        emergency_contact_name: profileData.emergency_contact_name ?? "",
        emergency_contact_phone: profileData.emergency_contact_phone ?? "",
        emergency_contact_relationship:
          profileData.emergency_contact_relationship ?? "",
      })
    }
  }, [profileData, profileForm])

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormData) => api.put("/auth/profile", data),
    onSuccess: () => {
      toast.success("Profile updated successfully")
      refresh()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Failed to update profile"
      toast.error(msg)
    },
  })

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post("/auth/change-password", data),
    onSuccess: () => {
      toast.success("Password changed successfully")
      passwordForm.reset()
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Failed to change password"
      toast.error(msg)
    },
  })

  const onSubmitProfile = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data)
  }

  const onSubmitPassword = (data: PasswordFormData) => {
    if (data.newPassword !== data.confirmPassword) {
      toast.error("New passwords do not match")
      return
    }
    if (data.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }
    changePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="My Profile"
        subtitle="Manage your personal information and security settings"
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "profile"
              ? "bg-white shadow-sm text-primary-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <User className="w-4 h-4" />
          Profile
        </button>
        <button
          onClick={() => setActiveTab("password")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "password"
              ? "bg-white shadow-sm text-primary-700"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Lock className="w-4 h-4" />
          Change Password
        </button>
      </div>

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className="card p-6">
          {/* Profile summary header */}
          <div className="flex items-center gap-4 pb-6 mb-6 border-b border-gray-100">
            <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-white text-xl font-bold">
              {user
                ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`
                : "?"}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {user?.firstName} {user?.lastName}
              </h2>
              <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5" />
                {user?.email}
              </p>
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                <Shield className="w-3 h-3" />
                {user?.role}
              </p>
            </div>
          </div>

          <form onSubmit={profileForm.handleSubmit(onSubmitProfile)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="First Name" required>
                <Input
                  {...profileForm.register("first_name", {
                    required: "First name is required",
                  })}
                  placeholder="First name"
                />
              </FormField>

              <FormField label="Last Name" required>
                <Input
                  {...profileForm.register("last_name", {
                    required: "Last name is required",
                  })}
                  placeholder="Last name"
                />
              </FormField>

              <FormField label="Email">
                <Input
                  {...profileForm.register("email")}
                  placeholder="email@example.com"
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Email cannot be changed here
                </p>
              </FormField>

              <FormField label="Gender">
                <Select
                  options={genderOptions}
                  {...profileForm.register("gender")}
                />
              </FormField>

              <FormField label="Phone Number">
                <Input
                  {...profileForm.register("phone_number")}
                  placeholder="+233 2XX XXX XXXX"
                />
              </FormField>

              <FormField label="Alternate Phone">
                <Input
                  {...profileForm.register("alternate_phone")}
                  placeholder="Alternate phone number"
                />
              </FormField>

              <FormField label="Date of Birth">
                <Input
                  type="date"
                  {...profileForm.register("date_of_birth")}
                />
              </FormField>

              <FormField label="National ID Type">
                <Input
                  {...profileForm.register("national_id_type")}
                  placeholder="e.g. Ghana Card, Passport"
                />
              </FormField>

              <FormField label="National ID Number">
                <Input
                  {...profileForm.register("national_id_number")}
                  placeholder="ID number"
                />
              </FormField>
            </div>

            {/* Address section */}
            <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              Address
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <FormField label="Address">
                  <Input
                    {...profileForm.register("address")}
                    placeholder="Street address"
                  />
                </FormField>
              </div>
              <FormField label="City">
                <Input {...profileForm.register("city")} placeholder="City" />
              </FormField>
              <FormField label="Region">
                <Input
                  {...profileForm.register("region")}
                  placeholder="Region"
                />
              </FormField>
              <FormField label="Postal Code">
                <Input
                  {...profileForm.register("postal_code")}
                  placeholder="Postal code"
                />
              </FormField>
            </div>

            {/* Emergency Contact */}
            <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-3 flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400" />
              Emergency Contact
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Contact Name">
                <Input
                  {...profileForm.register("emergency_contact_name")}
                  placeholder="Emergency contact name"
                />
              </FormField>
              <FormField label="Contact Phone">
                <Input
                  {...profileForm.register("emergency_contact_phone")}
                  placeholder="Emergency contact phone"
                />
              </FormField>
              <FormField label="Relationship">
                <Input
                  {...profileForm.register("emergency_contact_relationship")}
                  placeholder="e.g. Spouse, Parent, Sibling"
                />
              </FormField>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <Button
                type="submit"
                leftIcon={<Save className="w-4 h-4" />}
                isLoading={updateProfileMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Password Tab */}
      {activeTab === "password" && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Change Password
              </h2>
              <p className="text-xs text-gray-500">
                Your password must be at least 8 characters
              </p>
            </div>
          </div>

          <form onSubmit={passwordForm.handleSubmit(onSubmitPassword)}>
            <div className="space-y-4 max-w-md">
              <FormField label="Current Password" required>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    {...passwordForm.register("currentPassword", {
                      required: "Current password is required",
                    })}
                    placeholder="Enter current password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </FormField>

              <FormField label="New Password" required>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    {...passwordForm.register("newPassword", {
                      required: "New password is required",
                      minLength: {
                        value: 8,
                        message: "Password must be at least 8 characters",
                      },
                    })}
                    placeholder="Enter new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </FormField>

              <FormField label="Confirm New Password" required>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    {...passwordForm.register("confirmPassword", {
                      required: "Please confirm your new password",
                    })}
                    placeholder="Confirm new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </FormField>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
              <Button
                type="submit"
                leftIcon={<Save className="w-4 h-4" />}
                isLoading={changePasswordMutation.isPending}
              >
                Change Password
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
