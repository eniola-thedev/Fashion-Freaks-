
"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { MAIN_PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { colourHexFromName } from "@/lib/product-colours.mjs";

const COMMON_SIZES = [
  "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL",
  "One Size", "28", "30", "32", "34", "36", "38", "40",
];
const COMMON_COLOURS = [
  "Black", "White", "Navy", "Grey", "Beige", "Brown", "Olive", "Green", "Red",
];
const LEGACY_CATEGORIES = ["Shoes", "Trousers", "Other"];

type Variant = {
  id: string;
  colour: string;
  size: string;
  stock: number;
  imageUrl: string | null;
};

type ProductColourImage = {
  id?: string;
  imageUrl: string;
  imagePublicId: string | null;
  imageUploadProof: string | null;
  isPrimary: boolean;
};

type ProductColour = {
  id?: string;
  name: string;
  hexColor: string;
  images: ProductColourImage[];
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  discountPrice: number | null;
  isFeatured: boolean;
  category: string;
  colour: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  isActive: boolean;
  variants: Variant[];
  colours: ProductColour[];
};

type ProductForm = {
  name: string;
  description: string;
  price: string;
  category: string;
  colour: string;
  imageUrl: string;
  imagePublicId: string | null;
  imageUploadProof: string | null;
  discountPrice: string;
  isFeatured: boolean;
};

const emptyForm: ProductForm = {
  name: "",
  description: "",
  price: "",
  category: "T-Shirts",
  colour: "",
  imageUrl: "",
  imagePublicId: null,
  imageUploadProof: null,
  discountPrice: "",
  isFeatured: false,
};

function toForm(product: Product): ProductForm {
  return {
    name: product.name,
    description: product.description,
    price: String(product.price),
    discountPrice:
      product.discountPrice === null ? "" : String(product.discountPrice),
    isFeatured: product.isFeatured,
    category:
      MAIN_PRODUCT_CATEGORIES.find(
        (category) =>
          category.toLocaleLowerCase() === product.category.toLocaleLowerCase()
      ) ?? product.category,
    colour: product.colour ?? "",
    imageUrl: product.imageUrl ?? "",
    imagePublicId: product.imagePublicId,
    imageUploadProof: null,
  };
}

function variantKey(colour: string, size: string) {
  return JSON.stringify([colour.trim().toLocaleLowerCase(), size.trim().toLocaleLowerCase()]);
}

function colourDraftKey(colour: string) {
  return variantKey(colour, "");
}

function uniqueLabels(values: string[]) {
  return values.reduce<string[]>((result, value) => {
    if (!result.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      result.push(value);
    }
    return result;
  }, []);
}

function getColourDrafts(product: Product) {
  const drafts: Record<string, ProductColour> = {};

  for (const colour of product.colours ?? []) {
    drafts[colourDraftKey(colour.name)] = {
      ...colour,
      images: colour.images.map((image) => ({
        ...image,
        imageUploadProof: null,
      })),
    };
  }

  for (const variant of product.variants) {
    const key = colourDraftKey(variant.colour);
    if (!drafts[key]) {
      drafts[key] = {
        name: variant.colour,
        hexColor: colourHexFromName(variant.colour),
        images: [],
      };
    }

    if (
      variant.imageUrl &&
      !drafts[key].images.some(
        (image) => image.imageUrl === variant.imageUrl
      )
    ) {
      drafts[key].images.push({
        imageUrl: variant.imageUrl,
        imagePublicId: null,
        imageUploadProof: null,
        isPrimary: drafts[key].images.length === 0,
      });
    }
  }

  return drafts;
}

function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ProductsClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editing, setEditing] = useState<Product | null>(null);
  const [variantProduct, setVariantProduct] =
    useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(
    null
  );
  const [deleteError, setDeleteError] = useState("");

  const [variantForm, setVariantForm] = useState({
    colour: "",
    size: "M",
    stock: "0",
  });
  const [variantSizes, setVariantSizes] = useState<string[]>([]);
  const [variantColours, setVariantColours] = useState<string[]>([]);
  const [variantStocks, setVariantStocks] = useState<Record<string, string>>({});
  const [variantEnabled, setVariantEnabled] = useState<Record<string, boolean>>({});
  const [colourDrafts, setColourDrafts] = useState<Record<string, ProductColour>>({});
  const [colourUploading, setColourUploading] = useState<Record<string, boolean>>({});
  const [colourUploadErrors, setColourUploadErrors] = useState<Record<string, string>>({});
  const [customSize, setCustomSize] = useState("");
  const [customColour, setCustomColour] = useState("");

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [imageUploadError, setImageUploadError] = useState("");
  const [imageUploadFailed, setImageUploadFailed] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const imageUploadRequest = useRef<XMLHttpRequest | null>(null);
  const colourUploadControllers = useRef<Map<string, AbortController>>(
    new Map()
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadProducts = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/products", {
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load products.");
      }

      setError("");
      setProducts(data.products);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load products."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    if (!imagePreview.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  function abortColourUploads() {
    for (const controller of colourUploadControllers.current.values()) {
      controller.abort();
    }
    colourUploadControllers.current.clear();
  }

  function startCreate() {
    imageUploadRequest.current?.abort();
    imageUploadRequest.current = null;
    abortColourUploads();
    setUploadingImage(false);
    setEditing(null);
    setForm(emptyForm);
    setVariantSizes([]);
    setVariantColours([]);
    setVariantStocks({});
    setVariantEnabled({});
    setColourDrafts({});
    setColourUploading({});
    setColourUploadErrors({});
    setCustomSize("");
    setCustomColour("");
    setImagePreview("");
    setImageUploadError("");
    setImageUploadFailed(false);
    setImageUploadProgress(0);
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  function startEdit(product: Product) {
    imageUploadRequest.current?.abort();
    imageUploadRequest.current = null;
    abortColourUploads();
    setUploadingImage(false);
    setEditing(product);
    setForm(toForm(product));
    setVariantSizes(
      uniqueLabels(product.variants.map((variant) => variant.size))
    );
    setVariantColours(
      uniqueLabels([
        ...product.variants.map((variant) => variant.colour),
        ...(product.colours ?? []).map((colour) => colour.name),
      ])
    );
    setVariantStocks(
      Object.fromEntries(
        product.variants.map((variant) => [
          variantKey(variant.colour, variant.size),
          String(variant.stock),
        ])
      )
    );
    setVariantEnabled(
      Object.fromEntries(
        product.variants.map((variant) => [
          variantKey(variant.colour, variant.size),
          true,
        ])
      )
    );
    setColourDrafts(getColourDrafts(product));
    setColourUploading({});
    setColourUploadErrors({});
    setCustomSize("");
    setCustomColour("");
    setImagePreview(product.imageUrl ?? "");
    setImageUploadError("");
    setImageUploadFailed(false);
    setImageUploadProgress(0);
    setShowForm(true);
    setError("");
    setSuccess("");
    setVariantProduct(null);
  }

  function closeForm() {
    imageUploadRequest.current?.abort();
    imageUploadRequest.current = null;
    abortColourUploads();
    setUploadingImage(false);
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    setVariantSizes([]);
    setVariantColours([]);
    setVariantStocks({});
    setVariantEnabled({});
    setColourDrafts({});
    setColourUploading({});
    setColourUploadErrors({});
    setCustomSize("");
    setCustomColour("");
    setImagePreview("");
    setImageUploadError("");
    setImageUploadFailed(false);
    setImageUploadProgress(0);
  }

  function uploadImage(file: File) {
    setImageUploadError("");
    setImageUploadFailed(false);
    setImageUploadProgress(0);
    setImagePreview(URL.createObjectURL(file));
    setUploadingImage(true);

    const request = new XMLHttpRequest();
    imageUploadRequest.current = request;
    request.open("POST", "/api/admin/products/upload");
    request.responseType = "json";
    request.timeout = 120_000;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setImageUploadProgress(
          Math.min(99, Math.round((event.loaded / event.total) * 100))
        );
      }
    };

    request.onload = () => {
      if (imageUploadRequest.current !== request) return;
      imageUploadRequest.current = null;
      setUploadingImage(false);

      if (request.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      const result = request.response as
        | {
            imageUrl?: string;
            publicId?: string;
            proof?: string;
            error?: string;
          }
        | null;
      const uploadedUrl = result?.imageUrl;
      const uploadedPublicId = result?.publicId;
      const uploadedProof = result?.proof;

      if (
          request.status < 200 ||
          request.status >= 300 ||
          !uploadedUrl ||
          !uploadedPublicId ||
          !uploadedProof
      ) {
        setImageUploadError(
          result?.error || "Could not upload this image. Please try again."
        );
        setImageUploadFailed(true);
        return;
      }

      setForm((current) => ({
        ...current,
        imageUrl: uploadedUrl,
        imagePublicId: uploadedPublicId,
        imageUploadProof: uploadedProof,
      }));
      setImagePreview(uploadedUrl);
      setImageUploadProgress(100);
    };

    request.onerror = () => {
      if (imageUploadRequest.current !== request) return;
      imageUploadRequest.current = null;
      setUploadingImage(false);
      setImageUploadError("Could not connect to upload the image.");
      setImageUploadFailed(true);
    };

    request.ontimeout = () => {
      if (imageUploadRequest.current !== request) return;
      imageUploadRequest.current = null;
      setUploadingImage(false);
      setImageUploadError("Image upload timed out. Please try again.");
      setImageUploadFailed(true);
    };

    request.onabort = () => {
      if (imageUploadRequest.current !== request) return;
      imageUploadRequest.current = null;
      setUploadingImage(false);
    };

    const formData = new FormData();
    formData.append("file", file);
    request.send(formData);
  }

  async function uploadColourImages(colourName: string, files: File[]) {
    const key = colourDraftKey(colourName);
    const draft = colourDrafts[key];
    if (files.length === 0 || colourUploadControllers.current.has(key)) return;
    if ((draft?.images.length ?? 0) + files.length > 20) {
      setColourUploadErrors((current) => ({
        ...current,
        [key]: "A colour can have up to 20 images.",
      }));
      return;
    }

    setColourUploadErrors((current) => ({ ...current, [key]: "" }));
    setColourUploading((current) => ({ ...current, [key]: true }));
    const controller = new AbortController();
    colourUploadControllers.current.set(key, controller);

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/admin/products/upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const result = (await response.json()) as {
          imageUrl?: string;
          publicId?: string;
          proof?: string;
          error?: string;
        };
        const uploadedImageUrl = result.imageUrl;
        const uploadedPublicId = result.publicId;
        const uploadedProof = result.proof;

        if (response.status === 401) {
          window.location.replace("/admin/login");
          return;
        }
        if (
          !response.ok ||
          typeof uploadedImageUrl !== "string" ||
          typeof uploadedPublicId !== "string" ||
          typeof uploadedProof !== "string"
        ) {
          throw new Error(
            result.error || "Could not upload this colour image."
          );
        }

        setColourDrafts((current) => {
          const currentDraft =
            current[key] ?? {
              name: colourName,
              hexColor: colourHexFromName(colourName),
              images: [],
            };
          return {
            ...current,
            [key]: {
              ...currentDraft,
              images: [
                ...currentDraft.images,
                {
                  imageUrl: uploadedImageUrl,
                  imagePublicId: uploadedPublicId,
                  imageUploadProof: uploadedProof,
                  isPrimary: currentDraft.images.length === 0,
                },
              ],
            },
          };
        });
      }
    } catch (uploadError) {
      if (controller.signal.aborted) return;
      setColourUploadErrors((current) => ({
        ...current,
        [key]:
          uploadError instanceof Error
            ? uploadError.message
            : "Could not upload this colour image.",
      }));
    } finally {
      if (colourUploadControllers.current.get(key) === controller) {
        colourUploadControllers.current.delete(key);
        if (!controller.signal.aborted) {
          setColourUploading((current) => ({ ...current, [key]: false }));
        }
      }
    }
  }

  async function handleSaveProduct(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    const colourUploadPending = Object.values(colourUploading).some(Boolean);
    const colourUploadFailed = Object.values(colourUploadErrors).some(Boolean);
    const discountPrice = form.discountPrice.trim()
      ? Number(form.discountPrice)
      : null;
    if (
      discountPrice !== null &&
      (!Number.isSafeInteger(discountPrice) ||
        discountPrice <= 0 ||
        discountPrice >= Number(form.price))
    ) {
      setError("Enter a discounted price below the regular price, or leave it blank.");
      return;
    }

    if (variantSizes.length !== 0 || variantColours.length !== 0) {
      if (variantSizes.length === 0 || variantColours.length === 0) {
        setError("Choose at least one size and one colour, or clear both selections.");
        return;
      }

      for (const size of variantSizes) {
        for (const colour of variantColours) {
          const key = variantKey(colour, size);
          if (!variantEnabled[key]) continue;
          const value = variantStocks[key] ?? "0";
          if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1_000_000) {
            setError(`Enter a whole stock quantity from 0 to 1,000,000 for ${colour} / ${size}.`);
            return;
          }
        }
      }
    }

    if (
      uploadingImage ||
      imageUploadFailed ||
      colourUploadPending ||
      colourUploadFailed
    ) {
      setError(
        uploadingImage || colourUploadPending
          ? "Wait for all image uploads to finish before saving."
          : "Resolve or discard failed image uploads before saving."
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const editingExisting = Boolean(editing);
      const allVariants = variantSizes.flatMap((size) =>
        variantColours.flatMap((colour) => {
          const key = variantKey(colour, size);
          return variantEnabled[key]
            ? [{
                colour,
                size,
                stock: Number(variantStocks[key] ?? "0"),
              }]
            : [];
        })
      );
      const selectedCombinations = new Set(
        allVariants.map((variant) => variantKey(variant.colour, variant.size))
      );
      const existingVariantsByKey = new Map(
        (editing?.variants ?? []).map((variant) => [
          variantKey(variant.colour, variant.size),
          variant,
        ])
      );
      const variants = allVariants.filter((variant) => {
        const existing = existingVariantsByKey.get(
          variantKey(variant.colour, variant.size)
        );
        return !existing || existing.stock !== variant.stock;
      });
      const removedVariantIds = editing
        ? editing.variants
            .filter(
              (variant) =>
                !selectedCombinations.has(variantKey(variant.colour, variant.size))
            )
            .map((variant) => variant.id)
        : [];
      const colours = variantColours.map((name) => {
        const draft = colourDrafts[colourDraftKey(name)] ?? {
          name,
          hexColor: colourHexFromName(name),
          images: [],
        };
        return {
          name,
          hexColor: draft.hexColor,
          images: draft.images.map((image) => ({
            imageUrl: image.imageUrl,
            imagePublicId: image.imagePublicId,
            imageUploadProof: image.imageUploadProof,
            isPrimary: image.isPrimary,
          })),
        };
      });

      const response = await fetch(
        editing
          ? `/api/admin/products/${editing.id}`
          : "/api/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            price: Number(form.price),
            discountPrice,
            isFeatured: form.isFeatured,
            category: form.category,
            colour: form.colour || variantColours[0] || "",
            imageUrl: form.imageUrl,
            imagePublicId: form.imagePublicId,
            imageUploadProof: form.imageUploadProof,
            variants,
            colours,
            removedVariantIds,
          }),
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error || "Could not save the product."
        );
      }

      if (editingExisting) {
        setProducts((current) =>
          current.map((item) =>
            item.id === data.product.id
              ? data.product
              : item
          )
        );
        setSuccess(
          data.warning
            ? `Product updated successfully. ${data.warning}`
            : "Product updated successfully."
        );
      } else {
        setProducts((current) => [
          data.product,
          ...current,
        ]);
        setSuccess(
          data.warning
            ? `Product created successfully. ${data.warning}`
            : "Product created successfully."
        );
      }

      closeForm();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the product."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/admin/products/${product.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isActive: !product.isActive,
          }),
        }

      );

      const data = await response.json();

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error || "Could not update product status."
        );
      }

      setProducts((current) =>
        current.map((item) =>
          item.id === product.id ? data.product : item
        )
      );

      setSuccess(
        product.isActive
          ? "Product deactivated."
          : "Product activated."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update product status."
      );
    }
  }

  async function deleteProduct(product: Product) {
    setDeletingProductId(product.id);
    setDeleteError("");
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(product.id)}`,
        { method: "DELETE" }
      );
      const data = await response.json();

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Could not delete the product.");
      }

      setProducts((current) =>
        current.filter((entry) => entry.id !== product.id)
      );
      setDeleteTarget(null);
      setDeleteError("");
      if (editing?.id === product.id) closeForm();
      if (variantProduct?.id === product.id) setVariantProduct(null);
      setSuccess(
        data.warning
          ? `${product.name} was deleted. ${data.warning}`
          : `${product.name} was deleted successfully.`
      );
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : "Could not delete the product. Please try again."
      );
    } finally {
      setDeletingProductId(null);
    }
  }

  function startVariant(product: Product) {
    setVariantProduct(product);
    setVariantForm({
      colour: product.colour || "",
      size: "M",
      stock: "0",
    });
    setShowForm(false);
    setEditing(null);
    setError("");
    setSuccess("");
  }

  async function handleSaveVariant(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!variantProduct) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/admin/products/${variantProduct.id}/variants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            colour: variantForm.colour,
            size: variantForm.size,
            stock: Number(variantForm.stock),
          }),
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error || "Could not save inventory."
        );
      }

      setSuccess(
        `${data.variant.colour} / ${data.variant.size} saved.`
      );

      setVariantProduct(null);
      setLoading(true);
      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save inventory."
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredProducts = products.filter((product) => {
    const term = search.toLowerCase();

    return (
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term) ||
      product.slug.toLowerCase().includes(term)
    );
  });

  const activeCount = products.filter(
    (product) => product.isActive
  ).length;

  const totalUnits = products.reduce(
    (sum, product) =>
      sum +
      product.variants.reduce(
        (variantSum, variant) =>
          variantSum + variant.stock,
        0
      ),
    0
  );

  const lowStockVariants = products.flatMap((product) =>
    product.variants.filter(
      (variant) => variant.stock > 0 && variant.stock <= 5
    )
  ).length;
  const categoryOptions = [
    ...MAIN_PRODUCT_CATEGORIES,
    ...LEGACY_CATEGORIES,
    ...(form.category &&
    form.category.toLocaleLowerCase() !== "accessories" &&
    ![...MAIN_PRODUCT_CATEGORIES, ...LEGACY_CATEGORIES].some(
      (category) =>
        category.toLocaleLowerCase() === form.category.toLocaleLowerCase()
    )
      ? [form.category]
      : []),
  ];

  function addVariantSize(value: string) {
    const size = value.trim();
    if (
      !size ||
      variantSizes.some(
        (item) => item.toLocaleLowerCase() === size.toLocaleLowerCase()
      )
    ) return;

    setVariantSizes((current) => [...current, size]);
    setVariantStocks((current) => {
      const next = { ...current };
      for (const colour of variantColours) {
        const key = variantKey(colour, size);
        if (next[key] === undefined) next[key] = "0";
      }
      return next;
    });
    setVariantEnabled((current) => {
      const next = { ...current };
      for (const colour of variantColours) {
        next[variantKey(colour, size)] = true;
      }
      return next;
    });
  }

  function addVariantColour(value: string) {
    const colour = value.trim();
    if (
      !colour ||
      variantColours.some(
        (item) => item.toLocaleLowerCase() === colour.toLocaleLowerCase()
      )
    ) return;

    setVariantColours((current) => [...current, colour]);
    setColourDrafts((current) => ({
      ...current,
      [colourDraftKey(colour)]: {
        name: colour,
        hexColor: colourHexFromName(colour),
        images: [],
      },
    }));
    setVariantStocks((current) => {
      const next = { ...current };
      for (const size of variantSizes) {
        const key = variantKey(colour, size);
        if (next[key] === undefined) next[key] = "0";
      }
      return next;
    });
    setVariantEnabled((current) => {
      const next = { ...current };
      for (const size of variantSizes) {
        next[variantKey(colour, size)] = true;
      }
      return next;
    });
  }

  function removeVariantColour(colour: string) {
    setVariantColours((current) =>
      current.filter(
        (item) => item.toLocaleLowerCase() !== colour.toLocaleLowerCase()
      )
    );
    setColourDrafts((current) => {
      const next = { ...current };
      delete next[colourDraftKey(colour)];
      return next;
    });
    setColourUploadErrors((current) => {
      const next = { ...current };
      delete next[colourDraftKey(colour)];
      return next;
    });
    setVariantStocks((current) => {
      const next = { ...current };
      for (const size of variantSizes) {
        delete next[variantKey(colour, size)];
      }
      return next;
    });
    setVariantEnabled((current) => {
      const next = { ...current };
      for (const size of variantSizes) {
        delete next[variantKey(colour, size)];
      }
      return next;
    });
  }

  function toggleVariantSize(size: string) {
    const selected = variantSizes.some(
      (item) => item.toLocaleLowerCase() === size.toLocaleLowerCase()
    );
    setVariantSizes((current) =>
      selected
        ? current.filter(
            (value) => value.toLocaleLowerCase() !== size.toLocaleLowerCase()
          )
        : [...current, size]
    );
    if (selected) {
      setVariantStocks((current) => {
        const next = { ...current };
        for (const colour of variantColours) {
          delete next[variantKey(colour, size)];
        }
        return next;
      });
      setVariantEnabled((current) => {
        const next = { ...current };
        for (const colour of variantColours) {
          delete next[variantKey(colour, size)];
        }
        return next;
      });
    } else {
      setVariantEnabled((current) => {
        const next = { ...current };
        for (const colour of variantColours) {
          next[variantKey(colour, size)] = true;
        }
        return next;
      });
    }
  }

  return (
    <main className="admin-products-page">
      <header className="admin-products-header">
        <Link href="/admin" className="admin-products-brand">
          FASHION<span>FREAKS</span>
        </Link>

        <nav className="admin-products-nav">
          <Link href="/admin">Dashboard</Link>
          <span>Products & Inventory</span>
        </nav>
      </header>

      <section className="admin-products-content">
        <div className="admin-products-title-row">
          <div>
            <p className="admin-products-eyebrow">
              STORE MANAGEMENT
            </p>
            <h1>Products</h1>
            <p className="admin-products-subtitle">
              Manage your catalogue, prices, sizes, colours and stock.
            </p>
          </div>

          <button
            type="button"
            className="admin-products-primary"
            onClick={startCreate}
          >
            + Add product
          </button>
        </div>

        <div className="admin-products-stats">
          <article>
            <span>Total products</span>
            <strong>{products.length}</strong>
          </article>
          <article>
            <span>Active products</span>
            <strong>{activeCount}</strong>
          </article>
          <article>
            <span>Units in stock</span>
            <strong>{totalUnits.toLocaleString("en-NG")}</strong>
          </article>
          <article>
            <span>Low-stock variants</span>
            <strong>{lowStockVariants}</strong>
          </article>
        </div>

        {error && (
          <p className="admin-products-message error" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="admin-products-message success" role="status">
            {success}
          </p>
        )}

        {showForm && (
          <form
            className="admin-product-form"
            onSubmit={handleSaveProduct}
          >
            <div className="admin-product-form-heading">
              <h2>{editing ? "Edit product" : "Add a product"}</h2>
              <p>
                Prices are entered in whole naira. The product URL slug
                is generated automatically when you create a product.
              </p>
            </div>

            <div className="admin-product-form-grid">
              <div className="wide admin-form-section-title">
                <h3>Basic product information</h3>
              </div>
              <label>
                Product name *
                <input
                  required
                  maxLength={150}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="Oversized Essential Tee"
                />
              </label>

              <label>
                Category *
                <select
                  required
                  value={
                    form.category.toLocaleLowerCase() === "accessories"
                      ? ""
                      : form.category
                  }
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                >
                  <option value="" disabled>
                    Select a clothing category
                  </option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <div className="wide admin-form-section-title">
                <h3>Sizes, colours and inventory</h3>
                <p>Set stock independently for every size and colour combination.</p>
              </div>
              <div className="wide admin-variant-builder">
                <fieldset className="admin-variant-choice">
                  <legend>Sizes</legend>
                  <div className="admin-variant-chips">
                    {[...new Set([...COMMON_SIZES, ...variantSizes])].map((size) => {
                      const selected = variantSizes.some(
                        (value) =>
                          value.toLocaleLowerCase() === size.toLocaleLowerCase()
                      );
                      return (
                        <button
                          key={size}
                          type="button"
                          className={`admin-variant-chip${selected ? " selected" : ""}`}
                          aria-pressed={selected}
                          onClick={() =>
                            toggleVariantSize(size)
                          }
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                  <div className="admin-variant-custom">
                    <label htmlFor="custom-product-size">Other size</label>
                    <input
                      id="custom-product-size"
                      maxLength={30}
                      value={customSize}
                      onChange={(event) => setCustomSize(event.target.value)}
                      placeholder="e.g. 42 or 5Y"
                    />
                    <button
                      type="button"
                      className="admin-products-secondary"
                      onClick={() => {
                        addVariantSize(customSize);
                        setCustomSize("");
                      }}
                    >
                      Add size
                    </button>
                  </div>
                </fieldset>

                <fieldset className="admin-variant-choice">
                  <legend>Colours</legend>
                  <div className="admin-variant-chips">
                    {[...new Set([...COMMON_COLOURS, ...variantColours])].map((colour) => {
                      const selected = variantColours.includes(colour);
                      return (
                        <button
                          key={colour}
                          type="button"
                          className={`admin-variant-chip${selected ? " selected" : ""}`}
                          aria-pressed={selected}
                          onClick={() =>
                            selected
                              ? removeVariantColour(colour)
                              : addVariantColour(colour)
                          }
                        >
                          {colour}
                        </button>
                      );
                    })}
                  </div>
                  <div className="admin-variant-custom">
                    <label htmlFor="custom-product-colour">Custom colour</label>
                    <input
                      id="custom-product-colour"
                      maxLength={80}
                      value={customColour}
                      onChange={(event) => setCustomColour(event.target.value)}
                      placeholder="Enter a colour"
                    />
                    <button
                      type="button"
                      className="admin-products-secondary"
                      onClick={() => {
                        addVariantColour(customColour);
                        setCustomColour("");
                      }}
                    >
                      Add colour
                    </button>
                  </div>
                </fieldset>

                {variantColours.map((colour) => {
                  const key = colourDraftKey(colour);
                  const draft = colourDrafts[key] ?? {
                    name: colour,
                    hexColor: colourHexFromName(colour),
                    images: [],
                  };
                  const busy = Boolean(colourUploading[key]);
                  return (
                    <section
                      className="admin-colour-card"
                      key={key}
                      aria-label={`${colour} colour options`}
                    >
                      <div className="admin-colour-card-heading">
                        <span
                          className="admin-colour-preview"
                          style={{ backgroundColor: draft.hexColor }}
                        />
                        <div>
                          <h4>{colour}</h4>
                          <p>
                            {draft.images.length} image(s) ·{" "}
                            {variantSizes.length} size option(s)
                          </p>
                        </div>
                        <button
                          type="button"
                          className="admin-products-secondary"
                          onClick={() => removeVariantColour(colour)}
                          aria-label={`Remove ${colour} colour`}
                        >
                          Remove colour
                        </button>
                      </div>

                      <div className="admin-colour-card-controls">
                        <label>
                          Colour picker
                          <input
                            type="color"
                            value={draft.hexColor}
                            aria-label={`${colour} colour picker`}
                            onChange={(event) =>
                              setColourDrafts((current) => ({
                                ...current,
                                [key]: {
                                  ...draft,
                                  hexColor: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>

                        <label className="admin-colour-upload">
                          Add colour images
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                            multiple
                            disabled={saving || busy}
                            onChange={(event) => {
                              const files = Array.from(
                                event.currentTarget.files ?? []
                              );
                              event.currentTarget.value = "";
                              void uploadColourImages(colour, files);
                            }}
                          />
                          <span>
                            Upload up to 20 JPEG, PNG, or WebP images for this
                            colour.
                          </span>
                        </label>
                      </div>

                      {busy && (
                        <p className="admin-colour-upload-status" role="status">
                          Uploading colour images...
                        </p>
                      )}
                      {colourUploadErrors[key] && (
                        <div className="admin-colour-upload-error" role="alert">
                          <span>{colourUploadErrors[key]}</span>
                          <button
                            type="button"
                            className="admin-products-secondary"
                            onClick={() =>
                              setColourUploadErrors((current) => ({
                                ...current,
                                [key]: "",
                              }))
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      {draft.images.length > 0 && (
                        <div className="admin-colour-image-list">
                          {draft.images.map((image, imageIndex) => (
                            <article
                              className="admin-colour-image"
                              key={`${image.imageUrl}-${imageIndex}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={image.imageUrl} alt={`${colour} image ${imageIndex + 1}`} />
                              <div>
                                {image.isPrimary ? (
                                  <span className="admin-colour-primary-label">
                                    Main image
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="admin-products-secondary"
                                    onClick={() =>
                                      setColourDrafts((current) => ({
                                        ...current,
                                        [key]: {
                                          ...draft,
                                          images: draft.images.map((entry, index) => ({
                                            ...entry,
                                            isPrimary: index === imageIndex,
                                          })),
                                        },
                                      }))
                                    }
                                  >
                                    Make main
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="admin-colour-image-remove"
                                  onClick={() =>
                                    setColourDrafts((current) => {
                                      const images = draft.images
                                        .filter((_, index) => index !== imageIndex)
                                        .map((entry, index) => ({
                                          ...entry,
                                          isPrimary:
                                            entry.isPrimary ||
                                            (index === 0 &&
                                              !draft.images.some(
                                                (candidate) =>
                                                  candidate.isPrimary &&
                                                  candidate !== image
                                              )),
                                        }));
                                      return {
                                        ...current,
                                        [key]: { ...draft, images },
                                      };
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}

                {variantSizes.length > 0 && variantColours.length > 0 ? (
                  <div className="admin-variant-table-wrap">
                    <table className="admin-variant-stock-table">
                      <caption>Stock quantity by size and colour</caption>
                      <thead>
                        <tr>
                          <th scope="col">Size</th>
                          {variantColours.map((colour) => (
                            <th scope="col" key={colour}>{colour}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {variantSizes.map((size) => (
                          <tr key={size}>
                            <th scope="row">{size}</th>
                            {variantColours.map((colour) => {
                              const key = variantKey(colour, size);
                              const enabled = Boolean(variantEnabled[key]);
                              return (
                                <td key={key}>
                                  <label className="admin-variant-cell-toggle">
                                    <input
                                      type="checkbox"
                                      checked={enabled}
                                      onChange={(event) =>
                                        setVariantEnabled((current) => ({
                                          ...current,
                                          [key]: event.target.checked,
                                        }))
                                      }
                                    />
                                    <span>
                                      {enabled ? "Available" : "Not configured"}
                                    </span>
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max="1000000"
                                    step="1"
                                    required={enabled}
                                    disabled={!enabled}
                                    aria-label={`${colour} stock for size ${size}`}
                                    value={variantStocks[key] ?? "0"}
                                    onChange={(event) =>
                                      setVariantStocks((current) => ({
                                        ...current,
                                        [key]: event.target.value,
                                      }))
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="admin-variant-hint">
                    Select one or more sizes and colours to enter inventory.
                  </p>
                )}
              </div>

              <div className="wide admin-form-section-title">
                <h3>Pricing and product details</h3>
              </div>
              <label>
                Price (₦) *
                <input
                  required
                  type="number"
                  min="1"
                  max="100000000"
                  step="1"
                  value={form.price}
                  onChange={(event) =>
                    setForm({ ...form, price: event.target.value })
                  }
                  placeholder="18500"
                />
              </label>

              <label>
                Discounted price (₦)
                <input
                  type="number"
                  min="1"
                  max="100000000"
                  step="1"
                  value={form.discountPrice}
                  onChange={(event) =>
                    setForm({ ...form, discountPrice: event.target.value })
                  }
                  placeholder="Leave blank for no discount"
                />
              </label>

              <label>
                Main colour
                <input
                  maxLength={80}
                  value={form.colour}
                  onChange={(event) =>
                    setForm({ ...form, colour: event.target.value })
                  }
                  placeholder="Black"
                />
              </label>

              <label className="admin-featured-option">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(event) =>
                    setForm({ ...form, isFeatured: event.target.checked })
                  }
                />
                <span>Feature this product in the collection</span>
              </label>

              <div className="wide admin-form-section-title">
                <h3>Images and description</h3>
              </div>
              <label className="wide">
                Product image
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  disabled={saving || uploadingImage}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) uploadImage(file);
                  }}
                />
                <span>
                  JPEG, PNG, or WebP. Default maximum: 8 MB; minimum
                  dimensions 64 × 64 px.
                </span>
              </label>

              {imagePreview && (
                <div className="admin-product-image-preview wide">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Product image preview" />
                </div>
              )}

              {uploadingImage && (
                <div className="admin-product-upload-status wide">
                  <span>Uploading image... {imageUploadProgress}%</span>
                  <progress
                    value={imageUploadProgress}
                    max={100}
                    aria-label="Image upload progress"
                  />
                </div>
              )}

              {imageUploadError && (
                <div className="admin-product-upload-error wide" role="alert">
                  <span>{imageUploadError}</span>
                  {imageUploadFailed && (
                    <button
                      type="button"
                      className="admin-products-secondary"
                      onClick={() => {
                        setImageUploadFailed(false);
                        setImageUploadError("");
                        setImagePreview(form.imageUrl);
                      }}
                    >
                      Discard failed upload
                    </button>
                  )}
                </div>
              )}

              <label className="wide">
                Existing external image URL (optional)
                <input
                  type="url"
                  value={form.imageUrl}
                  disabled={uploadingImage || saving}
                  onChange={(event) => {
                    const imageUrl = event.target.value;
                    setForm({
                      ...form,
                      imageUrl,
                      imagePublicId: null,
                      imageUploadProof: null,
                    });
                    setImagePreview(imageUrl);
                    setImageUploadError("");
                    setImageUploadFailed(false);
                  }}
                  placeholder="Use this only for an existing externally hosted image"
                />
              </label>

              <label className="wide">
                Description
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={form.description}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description: event.target.value,
                    })
                  }
                  placeholder="Describe the fit, fabric and style."
                />
              </label>
            </div>

            <div className="admin-product-form-actions">
              <button
                type="button"
                className="admin-products-secondary"
                onClick={closeForm}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-products-primary"
                disabled={
                  saving ||
                  uploadingImage ||
                  imageUploadFailed ||
                  Object.values(colourUploading).some(Boolean) ||
                  Object.values(colourUploadErrors).some(Boolean)
                }
              >
                {saving
                  ? "Saving..."
                  : editing
                    ? "Save changes"
                    : "Create product"}
              </button>
            </div>
          </form>
        )}

        {variantProduct && (
          <form
            className="admin-product-form"
            onSubmit={handleSaveVariant}
          >
            <div className="admin-product-form-heading">
              <h2>Manage a size and colour</h2>
              <p>
                Product: <strong>{variantProduct.name}</strong>.
                Saving an existing colour/size combination replaces its
                stock quantity with the value entered below.
              </p>
            </div>

            <div className="admin-product-form-grid">
              <label>
                Colour *
                <input
                  required
                  maxLength={80}
                  value={variantForm.colour}
                  onChange={(event) =>
                    setVariantForm({
                      ...variantForm,
                      colour: event.target.value,
                    })
                  }
                  placeholder="Black"
                />
              </label>

              <label>
                Size *
                <select
                  required
                  value={variantForm.size}
                  onChange={(event) =>
                    setVariantForm({
                      ...variantForm,
                      size: event.target.value,
                    })
                  }
                >
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="2XL">2XL</option>
                  <option value="3XL">3XL</option>
                  <option value="4XL">4XL</option>
                  <option value="One Size">One Size</option>
                  <option value="28">28</option>
                  <option value="30">30</option>
                  <option value="32">32</option>
                  <option value="34">34</option>
                  <option value="36">36</option>
                  <option value="38">38</option>
                  <option value="40">40</option>
                </select>
              </label>

              <label>
                Available stock *
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={variantForm.stock}
                  onChange={(event) =>
                    setVariantForm({
                      ...variantForm,
                      stock: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="admin-product-form-actions">
              <button
                type="button"
                className="admin-products-secondary"
                onClick={() => setVariantProduct(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-products-primary"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save variant"}
              </button>
            </div>
          </form>
        )}

        <div className="admin-products-toolbar">
          <input
            type="search"
            placeholder="Search by name, category or slug..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search products"
          />
          <button
            type="button"
            className="admin-products-secondary"
            onClick={() => {
              setLoading(true);
              void loadProducts();
            }}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="admin-products-empty">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="admin-products-empty">
            <h2>No products found</h2>
            <p>Add a product or change your search.</p>
          </div>
        ) : (
          <div className="admin-products-table-wrap">
            <table className="admin-products-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Variants</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Manage</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => {
                  const stock = product.variants.reduce(
                    (sum, variant) => sum + variant.stock,
                    0
                  );

                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="admin-product-name">
                          {(product.imageUrl ??
                          product.colours
                            .flatMap((colour) => colour.images)
                            .find((image) => image.isPrimary)?.imageUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                product.imageUrl ??
                                product.colours
                                  .flatMap((colour) => colour.images)
                                  .find((image) => image.isPrimary)?.imageUrl ??
                                ""
                              }
                              alt=""
                            />
                          ) : (
                            <div className="admin-product-placeholder">
                              FF
                            </div>
                          )}
                          <div>
                            <strong>{product.name}</strong>
                            <small>{product.slug}</small>
                            {product.isFeatured && <small>Featured</small>}
                          </div>
                        </div>
                      </td>

                      <td className="admin-product-price">
                        {product.discountPrice !== null ? (
                          <>
                            <strong>{formatNaira(product.discountPrice)}</strong>
                            <del>{formatNaira(product.price)}</del>
                          </>
                        ) : (
                          formatNaira(product.price)
                        )}
                      </td>

                      <td>
                        {product.variants.length}
                        {product.variants.length > 0 && (
                          <details className="admin-variant-details">
                            <summary>View sizes</summary>
                            {product.variants.map((variant) => (
                              <div key={variant.id}>
                                {variant.colour} / {variant.size}:{" "}
                                {variant.stock}
                              </div>
                            ))}
                          </details>
                        )}
                      </td>

                      <td>
                        <span
                          className={
                            stock === 0
                              ? "stock-badge out"
                              : "stock-badge"
                          }
                        >
                          {stock} units
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            product.isActive
                              ? "product-status active"
                              : "product-status inactive"
                          }
                        >
                          {product.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <div className="admin-product-actions">
                          <button
                            type="button"
                            className="admin-product-toggle"
                            onClick={() => startEdit(product)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="admin-product-toggle"
                            onClick={() => startVariant(product)}
                          >
                            Stock / sizes
                          </button>

                          <button
                            type="button"
                            className="admin-product-toggle"
                            onClick={() => void toggleActive(product)}
                          >
                            {product.isActive ? "Deactivate" : "Activate"}
                          </button>

                          <button
                            type="button"
                            className="admin-product-delete"
                            onClick={() => {
                              setDeleteError("");
                              setDeleteTarget(product);
                            }}
                            disabled={deletingProductId !== null}
                            aria-label={`Delete ${product.name}`}
                            title="Delete product"
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="m19 6-1 14H6L5 6" />
                              <path d="M10 11v5M14 11v5" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {deleteTarget && (
        <div className="admin-delete-overlay">
          <section
            className="admin-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-delete-title"
            aria-describedby="admin-delete-description"
          >
            <h2 id="admin-delete-title">Delete this product?</h2>
            <p id="admin-delete-description">
              Are you sure you want to permanently delete this product? This
              action cannot be undone.
            </p>
            {deleteError && (
              <p className="admin-delete-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="admin-delete-actions">
              <button
                type="button"
                className="admin-product-toggle"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingProductId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-delete-confirm"
                onClick={() => void deleteProduct(deleteTarget)}
                disabled={deletingProductId === deleteTarget.id}
              >
                {deletingProductId === deleteTarget.id
                  ? "Deleting..."
                  : "Delete Product"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
