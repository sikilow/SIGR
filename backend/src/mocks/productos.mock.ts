/**
 * Datos falsos del menú para probar la API sin tocar la base de datos real.
 * Salen de `database/init.sql` (las 4 categorías y los 8 productos). NO se usan en producción.
 */
export interface CategoriaMock {
  id_categoria: number;
  nombre: string;
}

export interface ProductoMock {
  id_producto: number;
  id_categoria: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  /** `false` = se prepara al momento (no hay existencia que contar). */
  controla_existencia: boolean;
  existencia: number;
  stock_minimo: number;
}

export const categoriasMock: CategoriaMock[] = [
  { id_categoria: 1, nombre: "Entradas" },
  { id_categoria: 2, nombre: "Platos fuertes" },
  { id_categoria: 3, nombre: "Postres" },
  { id_categoria: 4, nombre: "Bebidas" },
];

export const productosMock: ProductoMock[] = [
  { id_producto: 1, id_categoria: 1, nombre: "Guacamole", descripcion: "Con totopos", precio: 85, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 2, id_categoria: 1, nombre: "Sopa de tortilla", descripcion: null, precio: 70, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 3, id_categoria: 2, nombre: "Tacos de arrachera", descripcion: "Orden de 4", precio: 140, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 4, id_categoria: 2, nombre: "Enchiladas verdes", descripcion: "Con pollo", precio: 120, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 5, id_categoria: 3, nombre: "Flan", descripcion: null, precio: 55, controla_existencia: true, existencia: 50, stock_minimo: 5 },
  { id_producto: 6, id_categoria: 4, nombre: "Agua de horchata", descripcion: "500 ml", precio: 35, controla_existencia: false, existencia: 50, stock_minimo: 5 },
  { id_producto: 7, id_categoria: 4, nombre: "Refresco", descripcion: null, precio: 30, controla_existencia: true, existencia: 50, stock_minimo: 5 },
  { id_producto: 8, id_categoria: 4, nombre: "Cerveza", descripcion: null, precio: 50, controla_existencia: true, existencia: 50, stock_minimo: 5 },
];
