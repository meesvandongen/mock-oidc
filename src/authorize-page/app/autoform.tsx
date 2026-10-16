import type {
  ParsedField,
  ParsedSchema,
  SchemaProvider,
  SchemaValidation,
} from '@autoform/core';
import type {
  ArrayElementWrapperProps,
  ArrayWrapperProps,
  AutoFormFieldComponents,
  AutoFormFieldProps,
  AutoFormUIComponents,
  FieldWrapperProps,
  ObjectWrapperProps,
} from '@autoform/react';
import { useFieldRHF } from '@autoform/react/react-hook-form';
import { ZodProvider } from '@autoform/zod';
import type { ReactNode } from 'react';
import { z } from 'zod';

type JsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
};

/**
 * Adds the JSON Schema `title`/`description` as AutoForm labels and renders
 * arrays of enum values as a checkbox group instead of a repeatable list.
 */
function enhanceField(field: ParsedField, json: JsonSchema | undefined): ParsedField {
  if (!json) {
    return field;
  }

  const enhanced: ParsedField = {
    ...field,
    fieldConfig: {
      ...field.fieldConfig,
      ...(json.title === undefined ? {} : { label: json.title }),
      ...(json.description === undefined ? {} : { description: json.description }),
    },
  };

  if (field.type === 'array' && Array.isArray(json.items?.enum)) {
    return {
      ...enhanced,
      type: 'multiselect',
      options: json.items.enum.map((value) => [String(value), String(value)]),
      schema: [],
    };
  }

  if (field.type === 'object') {
    enhanced.schema = field.schema?.map((child) =>
      enhanceField(child, json.properties?.[child.key]),
    );
  }

  if (field.type === 'array' && field.schema?.[0]) {
    const item = enhanceField(field.schema[0], json.items);
    // AutoForm labels array items by their index, which renders as no label.
    enhanced.schema = [
      {
        ...item,
        fieldConfig: {
          label: `${json.title ?? field.key} item`,
          ...item.fieldConfig,
        },
      },
    ];
  }

  return enhanced;
}

export class MockOidcSchemaProvider implements SchemaProvider {
  readonly schemaType = 'zod' as const;
  private readonly schema: z.ZodType;
  private readonly provider: ZodProvider<z.ZodObject>;

  constructor(private readonly jsonSchema: Record<string, unknown>) {
    const schema = z.fromJSONSchema(jsonSchema);
    if (!(schema instanceof z.ZodObject)) {
      throw new Error('The mock OIDC form schema must describe an object.');
    }
    this.schema = schema;
    this.provider = new ZodProvider(schema);
  }

  parseSchema(): ParsedSchema {
    const { properties } = this.jsonSchema as JsonSchema;
    return {
      fields: this.provider
        .parseSchema()
        .fields.map((field) => enhanceField(field, properties?.[field.key])),
    };
  }

  validateSchema(values: Record<string, unknown>): SchemaValidation {
    return this.provider.validateSchema(values);
  }

  getDefaultValues() {
    return this.provider.getDefaultValues();
  }

  getSchema() {
    return this.schema;
  }
}

function useField(path: string[]) {
  return useFieldRHF({ name: path.join('.') }).field;
}

function TextField({ id, path, inputProps, parsedField }: AutoFormFieldProps) {
  const field = useField(path);
  return (
    <input
      {...inputProps}
      id={id}
      type="text"
      name={field.name}
      ref={field.ref}
      value={field.value ?? ''}
      required={parsedField.required}
      onBlur={field.onBlur}
      onChange={(event) => field.onChange(event.target.value)}
    />
  );
}

function NumberField({ id, path, inputProps, parsedField }: AutoFormFieldProps) {
  const field = useField(path);
  return (
    <input
      {...inputProps}
      id={id}
      type="number"
      name={field.name}
      ref={field.ref}
      value={field.value ?? ''}
      required={parsedField.required}
      onBlur={field.onBlur}
      onChange={(event) =>
        field.onChange(
          event.target.value === '' ? undefined : event.target.valueAsNumber,
        )
      }
    />
  );
}

function BooleanField({ id, path, inputProps }: AutoFormFieldProps) {
  const field = useField(path);
  return (
    <input
      {...inputProps}
      id={id}
      type="checkbox"
      name={field.name}
      ref={field.ref}
      checked={field.value === true}
      onBlur={field.onBlur}
      onChange={(event) => field.onChange(event.target.checked)}
    />
  );
}

function SelectField({ id, path, inputProps, parsedField }: AutoFormFieldProps) {
  const field = useField(path);
  return (
    <select
      {...inputProps}
      id={id}
      name={field.name}
      ref={field.ref}
      value={field.value ?? ''}
      onBlur={field.onBlur}
      onChange={(event) =>
        field.onChange(event.target.value === '' ? undefined : event.target.value)
      }
    >
      {!parsedField.required || field.value === undefined ? (
        <option value="">—</option>
      ) : null}
      {parsedField.options?.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

function MultiSelectField({ id, path, inputProps, parsedField }: AutoFormFieldProps) {
  const field = useField(path);
  const selected = new Set<string>(Array.isArray(field.value) ? field.value : []);

  return (
    <div
      {...inputProps}
      id={id}
      role="group"
      aria-labelledby={`${id}-label`}
      className="mock-oidc-options"
    >
      {parsedField.options?.map(([value, label]) => (
        <label key={value} className="mock-oidc-option">
          <input
            type="checkbox"
            name={field.name}
            value={value}
            checked={selected.has(value)}
            onBlur={field.onBlur}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.target.checked) {
                next.add(value);
              } else {
                next.delete(value);
              }
              field.onChange(
                parsedField.options
                  ?.map(([option]) => option)
                  .filter((option) => next.has(option)),
              );
            }}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function FieldWrapper({ label, error, children, id, parsedField }: FieldWrapperProps) {
  // Object and array wrappers render their own legend.
  if (parsedField.type === 'object' || parsedField.type === 'array') {
    return (
      <div className="mock-oidc-field" data-field={id}>
        {children}
        {error ? (
          <p role="alert" className="mock-oidc-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const isGroup = parsedField.type === 'multiselect';
  const isCheckbox = parsedField.type === 'boolean';
  const description = parsedField.fieldConfig?.description;

  return (
    <div
      className={`mock-oidc-field${isCheckbox ? ' mock-oidc-field-checkbox' : ''}`}
      data-field={id}
    >
      {isGroup ? (
        <span className="mock-oidc-label" id={`${id}-label`}>
          {label}
          {parsedField.required ? null : ' (optional)'}
        </span>
      ) : (
        <label htmlFor={id}>
          {label}
          {parsedField.required || isCheckbox ? null : ' (optional)'}
        </label>
      )}
      {children}
      {description ? <p className="mock-oidc-description">{description}</p> : null}
      {error ? (
        <p role="alert" className="mock-oidc-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ObjectWrapper({ label, children }: ObjectWrapperProps) {
  return (
    <fieldset className="mock-oidc-object">
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}

function ArrayWrapper({ label, children, onAddItem }: ArrayWrapperProps) {
  return (
    <fieldset className="mock-oidc-object">
      <legend>{label}</legend>
      {children}
      <button type="button" className="mock-oidc-secondary" onClick={onAddItem}>
        Add
      </button>
    </fieldset>
  );
}

function ArrayElementWrapper({ children, onRemove }: ArrayElementWrapperProps) {
  return (
    <div className="mock-oidc-array-item">
      {children}
      <button type="button" className="mock-oidc-secondary" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

export const uiComponents: AutoFormUIComponents = {
  Form: (props) => <form {...props} noValidate className="mock-oidc-form" />,
  FieldWrapper,
  ErrorMessage: ({ error }) => (
    <p role="alert" className="mock-oidc-error">
      {error}
    </p>
  ),
  SubmitButton: ({ children }: { children: ReactNode }) => (
    <button type="submit" className="mock-oidc-submit">
      {children}
    </button>
  ),
  ObjectWrapper,
  ArrayWrapper,
  ArrayElementWrapper,
};

export const formComponents: AutoFormFieldComponents = {
  string: TextField,
  number: NumberField,
  boolean: BooleanField,
  select: SelectField,
  multiselect: MultiSelectField,
  fallback: TextField,
};
