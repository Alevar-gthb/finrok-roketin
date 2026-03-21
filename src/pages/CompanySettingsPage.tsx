import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCompanies,
  createCompany,
  updateCompany,
  setDefaultCompany,
  uploadCompanyLogo,
  deleteCompanyLogo,
  type Company,
} from '@/services/companyService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Building2, Upload, Star, Pencil, Plus, X } from 'lucide-react'

const EMPTY_FORM = {
  name: '',
  address: '',
  phone: '',
  website: '',
  email: '',
  npwp: '',
  logo_url: null as string | null,
  is_default: false,
  is_active: true,
}

export default function CompanySettingsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logo_url = form.logo_url

      if (editing) {
        // Upload logo first if new file selected
        if (logoFile) {
          setUploading(true)
          logo_url = await uploadCompanyLogo(editing.id, logoFile)
          setUploading(false)
        }
        return updateCompany(editing.id, { ...form, logo_url })
      } else {
        // Create first, then upload logo
        const created = await createCompany({ ...form, logo_url: null })
        if (logoFile) {
          setUploading(true)
          logo_url = await uploadCompanyLogo(created.id, logoFile)
          setUploading(false)
          return updateCompany(created.id, { logo_url })
        }
        return created
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      toast({ title: editing ? 'Company diperbarui' : 'Company ditambahkan' })
      handleClose()
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    },
  })

  const defaultMutation = useMutation({
    mutationFn: setDefaultCompany,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      toast({ title: 'Default company diubah' })
    },
  })

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setLogoFile(null)
    setLogoPreview(null)
    setOpen(true)
  }

  function openEdit(c: Company) {
    setEditing(c)
    setForm({
      name: c.name,
      address: c.address ?? '',
      phone: c.phone ?? '',
      website: c.website ?? '',
      email: c.email ?? '',
      npwp: c.npwp ?? '',
      logo_url: c.logo_url,
      is_default: c.is_default,
      is_active: c.is_active,
    })
    setLogoFile(null)
    setLogoPreview(c.logo_url)
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
    setEditing(null)
    setLogoFile(null)
    setLogoPreview(null)
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  function removeLogo() {
    setLogoFile(null)
    setLogoPreview(null)
    setForm(f => ({ ...f, logo_url: null }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          <h1 className="text-xl font-medium">Company Settings</h1>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Tambah Company
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Memuat...</p>
      ) : (
        <div className="space-y-3">
          {companies.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-4 border rounded-lg p-4"
            >
              {/* Logo */}
              <div className="w-16 h-12 flex items-center justify-center bg-muted rounded shrink-0">
                {c.logo_url ? (
                  <img
                    src={c.logo_url}
                    alt={c.name}
                    className="max-h-12 max-w-[64px] object-contain"
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{c.name}</span>
                  {c.is_default && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {c.phone} {c.website ? `· ${c.website}` : ''}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {!c.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => defaultMutation.mutate(c.id)}
                    title="Jadikan default"
                  >
                    <Star className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(c)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog Add/Edit */}
      <Dialog open={open} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Company' : 'Tambah Company'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Logo upload */}
            <div>
              <Label className="mb-1 block">Logo</Label>
              <div className="flex items-center gap-3">
                <div className="w-24 h-16 border rounded flex items-center justify-center bg-muted">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="preview"
                      className="max-h-14 max-w-[88px] object-contain"
                    />
                  ) : (
                    <Building2 className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Upload Logo
                  </Button>
                  {logoPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={removeLogo}
                    >
                      <X className="w-3 h-3 mr-1" /> Hapus
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, SVG. Maks 2MB.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
            </div>

            {/* Fields */}
            {([
              ['name', 'Nama Company *'],
              ['address', 'Alamat'],
              ['phone', 'No. Telepon'],
              ['website', 'Website'],
              ['email', 'Email'],
              ['npwp', 'NPWP'],
            ] as [keyof typeof form, string][]).map(([key, label]) => (
              <div key={key}>
                <Label className="mb-1 block">{label}</Label>
                <Input
                  value={(form[key] as string) ?? ''}
                  onChange={e =>
                    setForm(f => ({ ...f, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={handleClose}>
              Batal
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending || uploading}
            >
              {saveMutation.isPending || uploading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
