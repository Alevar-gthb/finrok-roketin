import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getCompanies,
  createCompany,
  updateCompany,
  setDefaultCompany,
  uploadCompanyLogo,
  type Company,
} from '@/services/companyService'
import { Button, Input, Modal } from '@/components/shared'
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Company | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  })

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logo_url = form.logo_url
      if (editing) {
        if (logoFile) {
          setUploading(true)
          logo_url = await uploadCompanyLogo(editing.id, logoFile)
          setUploading(false)
        }
        return updateCompany(editing.id, { ...form, logo_url })
      } else {
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
      showToast(editing ? 'Company diperbarui' : 'Company ditambahkan')
      handleClose()
    },
    onError: (e: Error) => showToast(`Error: ${e.message}`),
  })

  const defaultMutation = useMutation({
    mutationFn: setDefaultCompany,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
      showToast('Default company diubah')
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

  const fields: [keyof typeof EMPTY_FORM, string][] = [
    ['name',    'Nama Company *'],
    ['address', 'Alamat'],
    ['phone',   'No. Telepon'],
    ['website', 'Website'],
    ['email',   'Email'],
    ['npwp',    'NPWP'],
  ]

  return (
    <div className="page">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Building2 size={20} /> Company Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Kelola data company untuk invoice & quotation</p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus size={14} /> Tambah Company
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Memuat...</p>
      ) : companies.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Building2 size={32} className="mx-auto mb-2 opacity-30" />
          Belum ada company. Klik "Tambah Company" untuk mulai.
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map(c => (
            <div key={c.id} className="flex items-center gap-4 border border-border rounded-lg p-4 bg-white hover:bg-secondary/20 transition-colors">
              {/* Logo */}
              <div className="w-16 h-12 flex items-center justify-center bg-secondary/40 rounded shrink-0 border border-border">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="max-h-10 max-w-[60px] object-contain" />
                ) : (
                  <Building2 size={20} className="text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{c.name}</span>
                  {c.is_default && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Default
                    </span>
                  )}
                  {!c.is_active && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Nonaktif</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {[c.phone, c.website, c.email].filter(Boolean).join(' · ')}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {!c.is_default && (
                  <button
                    onClick={() => defaultMutation.mutate(c.id)}
                    className="p-1.5 rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    title="Jadikan default"
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  onClick={() => openEdit(c)}
                  className="p-1.5 rounded text-muted-foreground hover:text-rok-600 hover:bg-rok-50 transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add/Edit */}
      <Modal open={open} onClose={handleClose} title={editing ? 'Edit Company' : 'Tambah Company'} width="max-w-lg">
        <div className="space-y-4">
          {/* Logo upload */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Logo</p>
            <div className="flex items-center gap-3">
              <div className="w-24 h-16 border border-border rounded flex items-center justify-center bg-secondary/30 shrink-0">
                {logoPreview ? (
                  <img src={logoPreview} alt="preview" className="max-h-14 max-w-[88px] object-contain" />
                ) : (
                  <Building2 size={20} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={12} /> Upload Logo
                </Button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                  >
                    <X size={11} /> Hapus logo
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground">PNG, JPG, SVG. Maks 2MB.</p>
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
          {fields.map(([key, label]) => (
            <Input
              key={key}
              label={label}
              value={(form[key] as string) ?? ''}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            />
          ))}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={handleClose}>Batal</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending || uploading}
              loading={saveMutation.isPending || uploading}
            >
              {saveMutation.isPending || uploading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
