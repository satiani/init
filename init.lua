-- Disable netrw in favor of nvim-tree (Must be at top)
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1
vim.g.python3_host_prog = '/Users/samer.atiani/.pyenv/versions/3.10.13/bin/python3'

-- Build hooks for plugins that need post-install steps.
-- vim.pack fires PackChanged after install/update; this is the official
-- mechanism (see :help vim.pack-events). Must be defined before vim.pack.add().
vim.api.nvim_create_autocmd('PackChanged', { callback = function(ev)
  local name, kind, path = ev.data.spec.name, ev.data.kind, ev.data.path
  if kind ~= 'install' and kind ~= 'update' then return end

  if name == 'nvim-treesitter' then
    if not ev.data.active then vim.cmd.packadd('nvim-treesitter') end
    vim.cmd('TSUpdate')
  elseif name == 'telescope-fzf-native.nvim' then
    vim.system({ 'make' }, { cwd = path })
  end
end })

-- Install and load plugins via built-in vim.pack (Neovim 0.12+)
vim.pack.add({
  -- LSP Configuration & Plugins
  'https://github.com/neovim/nvim-lspconfig',
  'https://github.com/williamboman/mason.nvim',
  'https://github.com/williamboman/mason-lspconfig.nvim',
  'https://github.com/j-hui/fidget.nvim',
  'https://github.com/folke/lazydev.nvim',

  -- Code context in statusline
  'https://github.com/SmiteshP/nvim-navic',

  -- Autocompletion
  'https://github.com/hrsh7th/nvim-cmp',
  'https://github.com/hrsh7th/cmp-nvim-lsp',
  'https://github.com/hrsh7th/cmp-path',
  'https://github.com/L3MON4D3/LuaSnip',
  'https://github.com/saadparwaiz1/cmp_luasnip',

  -- Treesitter
  'https://github.com/nvim-treesitter/nvim-treesitter',

  -- Git
  'https://github.com/tpope/vim-fugitive',
  'https://github.com/tpope/vim-rhubarb',
  'https://github.com/lewis6991/gitsigns.nvim',

  -- Theme & UI
  'https://github.com/folke/tokyonight.nvim',
  'https://github.com/nvim-lualine/lualine.nvim',
  'https://github.com/lukas-reineke/indent-blankline.nvim',

  -- Editing
  'https://github.com/tpope/vim-sleuth',

  -- Fuzzy Finder
  'https://github.com/nvim-lua/plenary.nvim',
  'https://github.com/nvim-telescope/telescope.nvim',
  'https://github.com/nvim-telescope/telescope-fzf-native.nvim',

  -- File tree
  'https://github.com/nvim-tree/nvim-tree.lua',
  'https://github.com/nvim-tree/nvim-web-devicons',

  -- Registers
  'https://github.com/tversteeg/registers.nvim',
})

-- [[ Setting options ]]
-- See `:help vim.o`

-- Set highlight on search
vim.o.hlsearch = false

-- Make line numbers default
vim.wo.number = false

-- Enable mouse mode
vim.o.mouse = 'a'

-- Enable break indent
vim.o.breakindent = true

-- Save undo history
vim.o.undofile = true

-- Store swap files in ~/vimswap instead of next to the edited file
vim.fn.mkdir(vim.fn.expand('~/vimswap'), 'p')
vim.o.directory = vim.fn.expand('~/vimswap//')

-- Case insensitive searching UNLESS /C or capital in search
vim.o.ignorecase = true
vim.o.smartcase = true

-- Decrease update time
vim.o.updatetime = 250
vim.wo.signcolumn = 'yes'

-- Set colorscheme
vim.o.termguicolors = true
vim.cmd [[colorscheme tokyonight-night]]

-- Set completeopt to have a better completion experience
vim.o.completeopt = 'menuone,noselect'

vim.o.expandtab = true
vim.o.tabstop = 2
vim.o.shiftwidth = 2
vim.o.softtabstop = 2


-- [[ Basic Keymaps ]]
-- Set , as the leader key
-- See `:help mapleader`
--  NOTE: Must happen before plugins are required (otherwise wrong leader will be used)
vim.g.mapleader = ','
vim.g.maplocalleader = ','

-- Keymaps for better default experience
-- See `:help vim.keymap.set()`
vim.keymap.set({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- Remap for dealing with word wrap
vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })

vim.keymap.set('n', 'tn', vim.cmd.tabnew, { desc = '[T]ab [N]ew' })
vim.keymap.set('n', 'tl', vim.cmd.tabnext, { desc = '[T]ab Next' })
vim.keymap.set('n', 'th', vim.cmd.tabprevious, { desc = '[T]ab Previous' })

-- [[ Highlight on yank ]]
-- See `:help vim.highlight.on_yank()`
local highlight_group = vim.api.nvim_create_augroup('YankHighlight', { clear = true })
vim.api.nvim_create_autocmd('TextYankPost', {
  callback = function()
    vim.highlight.on_yank()
  end,
  group = highlight_group,
  pattern = '*',
})

-- Set lualine as statusline
-- See `:help lualine.txt`
require('lualine').setup {
  options = {
    icons_enabled = true,
    component_separators = '|',
    section_separators = '',
  },
  sections = {
    lualine_a = {'mode'},
    lualine_b = {'branch'},
    lualine_c = {{'filename', path = 1}},
    lualine_x = {
      {
        function()
          local ok, navic = pcall(require, 'nvim-navic')
          if ok and navic.is_available() then return navic.get_location() end
          return ''
        end,
      },
      'filetype',
    },
    lualine_y = {'progress'},
    lualine_z = {'location'},
  },
}


-- Enable `lukas-reineke/indent-blankline.nvim`
require('ibl').setup()

-- Gitsigns
-- See `:help gitsigns.txt`
require('gitsigns').setup()

-- [[ Configure Telescope ]]
-- See `:help telescope` and `:help telescope.setup()`
require('telescope').setup {
  defaults = {
    path_display = { "smart" },
    preview = {
      treesitter = false,
    },
    mappings = {
      i = {
        ['<C-j>'] = 'move_selection_next',
        ['<C-k>'] = 'move_selection_previous',
      },
    },
  },
  pickers = {
    lsp_references = { show_line = false },
    lsp_definitions = { show_line = false },
    lsp_implementations = { show_line = false },
  },
}

-- Enable telescope fzf native, if installed
pcall(require('telescope').load_extension, 'fzf')

-- See `:help telescope.builtin`
vim.keymap.set('n', '<leader>?', require('telescope.builtin').oldfiles, { desc = '[?] Find recently opened files' })
vim.keymap.set('n', '<leader><space>', require('telescope.builtin').buffers, { desc = '[ ] Find existing buffers' })
vim.keymap.set('n', '<leader>/', function()
  -- You can pass additional configuration to telescope to change theme, layout, etc.
  require('telescope.builtin').current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
    winblend = 10,
    previewer = false,
  })
end, { desc = '[/] Fuzzily search in current buffer]' })

vim.keymap.set('n', '<leader>sf', require('telescope.builtin').find_files, { desc = '[S]earch [F]iles' })
vim.keymap.set('n', '<leader>sh', require('telescope.builtin').help_tags, { desc = '[S]earch [H]elp' })
vim.keymap.set('n', '<leader>sw', require('telescope.builtin').grep_string, { desc = '[S]earch current [W]ord' })
vim.keymap.set('n', '<leader>sg', require('telescope.builtin').live_grep, { desc = '[S]earch by [G]rep' })
vim.keymap.set('n', '<leader>sd', require('telescope.builtin').diagnostics, { desc = '[S]earch [D]iagnostics' })
vim.keymap.set('n', '<leader>sch', require('telescope.builtin').command_history, { desc = '[S]earch [C]command [H]istory' })



-- Nvim tree
require('nvim-tree').setup({
  view = {
    adaptive_size = true,
  },
  actions = {
    open_file = {
      quit_on_open = true,
      window_picker = {
        enable = false,
      },
    },
    change_dir = {
      global = true,
    }
  }
})

vim.keymap.set('n', '<leader>nt', function() vim.api.nvim_command('NvimTreeOpen') end, { desc = "Open [N]eovim [T]ree" })
vim.keymap.set('n', '<leader>nb', function() vim.api.nvim_command('NvimTreeOpen ' .. vim.fn.expand '%:p:h') end, { desc = "Open [N]eovim Tree on current [B]uffer" })

require('registers').setup({
  window = {
    border = 'rounded',
  },
})

-- Diagnostic keymaps (built-in [d, ]d, K are provided by nvim 0.11+ defaults)
vim.keymap.set('n', '<leader>de', vim.diagnostic.open_float)
vim.keymap.set('n', '<leader>dq', vim.diagnostic.setloclist)
vim.keymap.set('n', '<leader>dh', vim.diagnostic.hide, { desc = "[D]iagnostics [H]ide" })

-- Setup nvim-navic for showing current code context
local navic_ok, navic = pcall(require, 'nvim-navic')
if navic_ok then
  navic.setup({
    lsp = { auto_attach = true },
    icons = { enabled = false },
  })
end

-- LSP settings.
-- Use LspAttach autocmd so keymaps are set for ALL LSP clients regardless of
-- how they are started (e.g. via mason-lspconfig automatic_enable, which
-- overrides any per-server on_attach and skips the wildcard config).
vim.api.nvim_create_autocmd('LspAttach', {
  callback = function(args)
    local client = vim.lsp.get_client_by_id(args.data.client_id)
    local bufnr = args.buf

    -- Attach navic for code context in statusline
    if navic_ok and client.server_capabilities.documentSymbolProvider then
      navic.attach(client, bufnr)
    end

    local nmap = function(keys, func, desc)
      vim.keymap.set('n', keys, func, { buffer = bufnr, desc = 'LSP: ' .. desc })
    end

    nmap('<leader>rn', vim.lsp.buf.rename, '[R]e[n]ame')
    nmap('<leader>ca', vim.lsp.buf.code_action, '[C]ode [A]ction')

    nmap('gd', vim.lsp.buf.definition, '[G]oto [D]efinition')
    nmap('gr', require('telescope.builtin').lsp_references, '[G]oto [R]eferences')
    nmap('gI', require('telescope.builtin').lsp_implementations, '[G]oto [I]mplementation')
    nmap('<leader>D', vim.lsp.buf.type_definition, 'Type [D]efinition')
    vim.keymap.set({'v', 'n'}, '<leader>F', vim.lsp.buf.format, { buffer = bufnr, desc = 'LSP: [F]ormat Selection' })
    nmap('<leader>ds', require('telescope.builtin').lsp_document_symbols, '[D]ocument [S]ymbols')
    nmap('<leader>ws', require('telescope.builtin').lsp_dynamic_workspace_symbols, '[W]orkspace [S]ymbols')

    -- K for hover is a built-in default in nvim 0.11+
    nmap('<C-k>', vim.lsp.buf.signature_help, 'Signature Documentation')

    nmap('gD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')
    nmap('<leader>wa', vim.lsp.buf.add_workspace_folder, '[W]orkspace [A]dd Folder')
    nmap('<leader>wr', vim.lsp.buf.remove_workspace_folder, '[W]orkspace [R]emove Folder')
    nmap('<leader>wl', function()
      print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, '[W]orkspace [L]ist Folders')

    vim.api.nvim_buf_create_user_command(bufnr, 'Format', function(_)
      vim.lsp.buf.format()
    end, { desc = 'Format current buffer with LSP' })
  end,
})

-- Enable the following language servers
--  Feel free to add/remove any LSPs that you want here. They will automatically be installed.
--
--  Add any additional override configuration in the following tables. They will be passed to
--  the `settings` field of the server config. You must look up that documentation yourself.
local servers = {
  -- clangd = {},
  gopls = {
    cmd = { 'gopls', '-remote=auto', '-remote.listen.timeout=24h' },
    settings = {
      gopls = {
        directoryFilters = {
          "-**/bazel-bin",
          "-**/bazel-out",
          "-**/bazel-testlogs",
          "-**/bazel-dd-source",
          "-**/bazel-dd-go",
          "-**/bazel-logs-backend",
          "-**/bazel-dogweb",
        },
      },
    },
  },
  -- pyright = {},
  -- rust_analyzer = {},
  -- tsserver = {},

  pylsp = {
    pylsp = {
      plugins = {
        pycodestyle = {
          ignore = {'E302', 'E305', 'E501'},
          maxLineWidth = 120
        },
      },
    },
  },

}

-- Install treesitter parsers for your languages and enable highlighting
require('nvim-treesitter').install({ 'go', 'gomod', 'python', 'bash', 'json', 'yaml', 'typescript' })
vim.api.nvim_create_autocmd('FileType', {
  callback = function()
    if vim.treesitter.get_parser(0, nil, { error = false }) then
      vim.treesitter.start()
    end
  end,
})

-- Setup neovim lua configuration (lazydev replaces neodev)
require('lazydev').setup()
--
-- nvim-cmp supports additional completion capabilities, so broadcast that to servers
local capabilities = vim.lsp.protocol.make_client_capabilities()
capabilities = require('cmp_nvim_lsp').default_capabilities(capabilities)

-- Setup mason so it can manage external tooling
require('mason').setup()

-- Ensure the servers above are installed
local mason_lspconfig = require 'mason-lspconfig'

mason_lspconfig.setup {
  ensure_installed = vim.tbl_keys(servers),
}

-- Use the new vim.lsp.config API (Neovim 0.11+)
-- Set default config for all LSP servers
vim.lsp.config('*', {
  capabilities = capabilities,
})

-- Setup each server from the servers table
for server_name, server_settings in pairs(servers) do
  vim.lsp.config(server_name, server_settings)
  vim.lsp.enable(server_name)
end

-- Turn on lsp status information
require('fidget').setup({})

-- nvim-cmp setup
local cmp = require 'cmp'
local luasnip = require 'luasnip'

cmp.setup {
  snippet = {
    expand = function(args)
      luasnip.lsp_expand(args.body)
    end,
  },
  mapping = cmp.mapping.preset.insert {
    ['<C-d>'] = cmp.mapping.scroll_docs(-4),
    ['<C-f>'] = cmp.mapping.scroll_docs(4),
    ['<C-Space>'] = cmp.mapping.complete(),
    ['<CR>'] = cmp.mapping.confirm {
      behavior = cmp.ConfirmBehavior.Replace,
      select = true,
    },
    ['<Tab>'] = cmp.mapping(function(fallback)
      if cmp.visible() then
        cmp.select_next_item()
      elseif luasnip.expand_or_jumpable() then
        luasnip.expand_or_jump()
      else
        fallback()
      end
    end, { 'i', 's' }),
    ['<S-Tab>'] = cmp.mapping(function(fallback)
      if cmp.visible() then
        cmp.select_prev_item()
      elseif luasnip.jumpable(-1) then
        luasnip.jump(-1)
      else
        fallback()
      end
    end, { 'i', 's' }),
  },
  sources = {
    { name = 'nvim_lsp' },
    { name = 'luasnip' },
    { name = 'path' },
  },
}

-- vim: ts=2 sts=2 sw=2 et
